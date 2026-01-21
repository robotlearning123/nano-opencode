// nano-opencode: Minimal AI coding agent in Zig (~110 LOC)
// Usage: ANTHROPIC_API_KEY=sk-... zig build run -- "your prompt"
// Build: zig build -Doptimize=ReleaseFast

const std = @import("std");

const tools =
    \\[{"name":"read_file","description":"Read file","input_schema":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}},
    \\{"name":"bash","description":"Run command","input_schema":{"type":"object","properties":{"command":{"type":"string"}},"required":["command"]}},
    \\{"name":"list_dir","description":"List directory","input_schema":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}}]
;

fn getStr(obj: std.json.Value, key: []const u8) []const u8 {
    return if (obj == .object) if (obj.object.get(key)) |v| if (v == .string) v.string else "" else "" else "";
}

fn run(alloc: std.mem.Allocator, name: []const u8, input: std.json.Value) ![]u8 {
    if (std.mem.eql(u8, name, "read_file")) {
        return std.fs.cwd().readFileAlloc(alloc, getStr(input, "path"), 1024 * 1024) catch return try alloc.dupe(u8, "Error reading file");
    } else if (std.mem.eql(u8, name, "bash")) {
        const argv = [_][]const u8{ "sh", "-c", getStr(input, "command") };
        var child = std.process.Child.init(&argv, alloc);
        child.stdout_behavior = .Pipe;
        try child.spawn();
        const out = try child.stdout.?.reader().readAllAlloc(alloc, 50000);
        _ = try child.wait();
        return out;
    } else if (std.mem.eql(u8, name, "list_dir")) {
        const path = getStr(input, "path");
        var dir = std.fs.cwd().openDir(if (path.len > 0) path else ".", .{ .iterate = true }) catch return try alloc.dupe(u8, "Error opening dir");
        defer dir.close();
        var result = std.ArrayList(u8).init(alloc);
        var iter = dir.iterate();
        while (try iter.next()) |e| try result.writer().print("{c} {s}\n", .{ if (e.kind == .directory) @as(u8, 'd') else '-', e.name });
        return try result.toOwnedSlice();
    }
    return try alloc.dupe(u8, "Unknown tool");
}

fn apiCall(alloc: std.mem.Allocator, key: []const u8, body: []const u8) ![]u8 {
    const header = try std.fmt.allocPrint(alloc, "x-api-key: {s}", .{key});
    const argv = [_][]const u8{ "curl", "-s", "-X", "POST", "https://api.anthropic.com/v1/messages", "-H", "Content-Type: application/json", "-H", header, "-H", "anthropic-version: 2023-06-01", "-d", body };
    var child = std.process.Child.init(&argv, alloc);
    child.stdout_behavior = .Pipe;
    try child.spawn();
    const out = try child.stdout.?.reader().readAllAlloc(alloc, 1024 * 1024);
    _ = try child.wait();
    return out;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const alloc = gpa.allocator();
    const args = try std.process.argsAlloc(alloc);
    if (args.len < 2) { std.debug.print("Usage: nano \"prompt\"\n", .{}); return; }
    const key = std.posix.getenv("ANTHROPIC_API_KEY") orelse { std.debug.print("Set ANTHROPIC_API_KEY\n", .{}); return; };
    const model = std.posix.getenv("MODEL") orelse "claude-sonnet-4-20250514";

    var msgs = std.ArrayList(u8).init(alloc);
    try msgs.writer().print("[{{\"role\":\"user\",\"content\":\"{s}\"}}]", .{args[1]});

    while (true) {
        const body = try std.fmt.allocPrint(alloc, "{{\"model\":\"{s}\",\"max_tokens\":8192,\"tools\":{s},\"messages\":{s},\"system\":\"You are a coding assistant.\"}}", .{ model, tools, msgs.items });
        const res = try apiCall(alloc, key, body);
        const parsed = try std.json.parseFromSlice(std.json.Value, alloc, res, .{});
        const stop = getStr(parsed.value, "stop_reason");
        const content = if (parsed.value == .object) parsed.value.object.get("content") else null;

        if (!std.mem.eql(u8, stop, "tool_use")) {
            if (content) |c| if (c == .array) for (c.array.items) |b| if (std.mem.eql(u8, getStr(b, "type"), "text")) std.debug.print("{s}", .{getStr(b, "text")});
            break;
        }

        msgs.clearRetainingCapacity();
        try msgs.appendSlice("[");
        var first = true;
        if (content) |c| if (c == .array) for (c.array.items) |b| {
            if (std.mem.eql(u8, getStr(b, "type"), "tool_use")) {
                const name = getStr(b, "name");
                const id = getStr(b, "id");
                const input = if (b == .object) b.object.get("input") orelse std.json.Value{ .null = {} } else std.json.Value{ .null = {} };
                std.debug.print("⚡ {s}\n", .{name});
                const result = try run(alloc, name, input);
                std.debug.print("{s}\n", .{result[0..@min(result.len, 100)]});
                if (!first) try msgs.appendSlice(",");
                try msgs.writer().print("{{\"type\":\"tool_result\",\"tool_use_id\":\"{s}\",\"content\":\"{s}\"}}", .{ id, result });
                first = false;
            }
        };
        try msgs.appendSlice("]");
    }
}
