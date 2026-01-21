// nano-opencode: Minimal AI coding agent in C (~200 LOC, zero dependencies)
// Build: gcc -o nano nano.c
// Usage: ANTHROPIC_API_KEY=sk-... ./nano "your prompt"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <netdb.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <dirent.h>

#define BUF_SIZE 1048576
static char buf[BUF_SIZE], resp[BUF_SIZE];

static const char *tools = "[{\"name\":\"read_file\",\"description\":\"Read file\",\"input_schema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"}},\"required\":[\"path\"]}},"
"{\"name\":\"write_file\",\"description\":\"Write file\",\"input_schema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"content\":{\"type\":\"string\"}},\"required\":[\"path\",\"content\"]}},"
"{\"name\":\"bash\",\"description\":\"Run command\",\"input_schema\":{\"type\":\"object\",\"properties\":{\"command\":{\"type\":\"string\"}},\"required\":[\"command\"]}},"
"{\"name\":\"list_dir\",\"description\":\"List directory\",\"input_schema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"}},\"required\":[\"path\"]}}]";

// Simple JSON string extractor: find "key":"value" and return value
static char* json_str(const char *json, const char *key, char *out, int max) {
    char pattern[64]; snprintf(pattern, sizeof(pattern), "\"%s\":\"", key);
    char *p = strstr(json, pattern);
    if (!p) { out[0] = 0; return out; }
    p += strlen(pattern);
    int i = 0;
    while (*p && *p != '"' && i < max - 1) {
        if (*p == '\\' && *(p+1)) { p++; } // skip escape
        out[i++] = *p++;
    }
    out[i] = 0;
    return out;
}

static char* run_tool(const char *name, const char *json_input, char *result) {
    char path[1024], content[BUF_SIZE], cmd[1024];

    if (strcmp(name, "read_file") == 0) {
        json_str(json_input, "path", path, sizeof(path));
        FILE *f = fopen(path, "r");
        if (!f) { snprintf(result, BUF_SIZE, "Error: cannot open %s", path); return result; }
        size_t n = fread(result, 1, BUF_SIZE - 1, f);
        result[n] = 0; fclose(f);
    } else if (strcmp(name, "write_file") == 0) {
        json_str(json_input, "path", path, sizeof(path));
        json_str(json_input, "content", content, sizeof(content));
        FILE *f = fopen(path, "w");
        if (!f) { snprintf(result, BUF_SIZE, "Error: cannot write %s", path); return result; }
        fputs(content, f); fclose(f); strcpy(result, "OK");
    } else if (strcmp(name, "bash") == 0) {
        json_str(json_input, "command", cmd, sizeof(cmd));
        FILE *p = popen(cmd, "r");
        if (!p) { strcpy(result, "Error: popen failed"); return result; }
        size_t n = fread(result, 1, BUF_SIZE - 1, p);
        result[n] = 0; pclose(p);
    } else if (strcmp(name, "list_dir") == 0) {
        json_str(json_input, "path", path, sizeof(path));
        if (!*path) strcpy(path, ".");
        DIR *d = opendir(path);
        if (!d) { strcpy(result, "Error: cannot open dir"); return result; }
        struct dirent *e; int len = 0;
        while ((e = readdir(d)) && len < BUF_SIZE - 256) {
            len += snprintf(result + len, BUF_SIZE - len, "%c %s\n", e->d_type == DT_DIR ? 'd' : '-', e->d_name);
        }
        closedir(d);
    } else { strcpy(result, "Unknown tool"); }
    return result;
}

// Simple HTTPS via external curl (fallback since raw TLS is complex)
static int http_post(const char *host, const char *path, const char *key, const char *body, char *out) {
    char cmd[BUF_SIZE + 1024];
    snprintf(cmd, sizeof(cmd),
        "curl -s -X POST 'https://%s%s' "
        "-H 'Content-Type: application/json' "
        "-H 'x-api-key: %s' "
        "-H 'anthropic-version: 2023-06-01' "
        "-d '%s'", host, path, key, body);
    FILE *p = popen(cmd, "r");
    if (!p) return -1;
    size_t n = fread(out, 1, BUF_SIZE - 1, p);
    out[n] = 0;
    return pclose(p);
}

// Escape string for JSON
static void json_escape(const char *in, char *out, int max) {
    int j = 0;
    for (int i = 0; in[i] && j < max - 2; i++) {
        if (in[i] == '"' || in[i] == '\\') out[j++] = '\\';
        else if (in[i] == '\n') { out[j++] = '\\'; out[j++] = 'n'; continue; }
        else if (in[i] == '\r') { out[j++] = '\\'; out[j++] = 'r'; continue; }
        else if (in[i] == '\t') { out[j++] = '\\'; out[j++] = 't'; continue; }
        out[j++] = in[i];
    }
    out[j] = 0;
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "Usage: nano \"your prompt\"\n"); return 1; }

    char *key = getenv("ANTHROPIC_API_KEY");
    if (!key) key = getenv("ANTHROPIC_AUTH_TOKEN");
    if (!key || !*key) { fprintf(stderr, "Set ANTHROPIC_API_KEY\n"); return 1; }

    char *base = getenv("ANTHROPIC_BASE_URL");
    char host[256] = "api.anthropic.com";
    if (base && strstr(base, "://")) {
        char *h = strstr(base, "://") + 3;
        strncpy(host, h, sizeof(host) - 1);
        char *slash = strchr(host, '/'); if (slash) *slash = 0;
    }

    char *model = getenv("MODEL");
    if (!model) model = "claude-sonnet-4-20250514";

    char messages[BUF_SIZE], escaped[BUF_SIZE], tool_result[BUF_SIZE];
    json_escape(argv[1], escaped, sizeof(escaped));
    snprintf(messages, sizeof(messages), "[{\"role\":\"user\",\"content\":\"%s\"}]", escaped);

    while (1) {
        snprintf(buf, sizeof(buf),
            "{\"model\":\"%s\",\"max_tokens\":8192,\"tools\":%s,\"messages\":%s,\"system\":\"You are a coding assistant. Use tools to help.\"}",
            model, tools, messages);

        // Escape single quotes in body for shell
        char body_escaped[BUF_SIZE];
        int j = 0;
        for (int i = 0; buf[i] && j < BUF_SIZE - 5; i++) {
            if (buf[i] == '\'') { body_escaped[j++] = '\''; body_escaped[j++] = '"'; body_escaped[j++] = '\''; body_escaped[j++] = '"'; body_escaped[j++] = '\''; }
            else body_escaped[j++] = buf[i];
        }
        body_escaped[j] = 0;

        if (http_post(host, "/v1/messages", key, body_escaped, resp) != 0) {
            fprintf(stderr, "Error: API call failed\n"); return 1;
        }

        char stop[64]; json_str(resp, "stop_reason", stop, sizeof(stop));

        // Find and print text content
        char *text_start = strstr(resp, "\"type\":\"text\"");
        if (text_start) {
            char text[BUF_SIZE];
            json_str(text_start, "text", text, sizeof(text));
            if (*text) printf("%s", text);
        }

        if (strcmp(stop, "tool_use") != 0) break;

        // Process tool_use blocks
        char *tool_pos = resp;
        char new_messages[BUF_SIZE]; new_messages[0] = 0;
        strcat(new_messages, "[");
        int first = 1;

        while ((tool_pos = strstr(tool_pos, "\"type\":\"tool_use\"")) != NULL) {
            char name[64], id[64], input_buf[4096];
            json_str(tool_pos, "name", name, sizeof(name));
            json_str(tool_pos, "id", id, sizeof(id));

            // Extract input object (simplified)
            char *inp = strstr(tool_pos, "\"input\":");
            if (inp) {
                inp += 8;
                int depth = 0, k = 0;
                for (; *inp && k < sizeof(input_buf) - 1; inp++) {
                    if (*inp == '{') depth++;
                    else if (*inp == '}') { depth--; if (depth == 0) { input_buf[k++] = '}'; break; } }
                    input_buf[k++] = *inp;
                }
                input_buf[k] = 0;
            }

            printf("⚡ %s\n", name);
            run_tool(name, input_buf, tool_result);
            printf("%.100s\n", tool_result);

            char result_escaped[BUF_SIZE];
            json_escape(tool_result, result_escaped, sizeof(result_escaped));

            char tr[BUF_SIZE];
            snprintf(tr, sizeof(tr), "%s{\"type\":\"tool_result\",\"tool_use_id\":\"%s\",\"content\":\"%s\"}",
                first ? "" : ",", id, result_escaped);
            strcat(new_messages, tr);
            first = 0;
            tool_pos++;
        }
        strcat(new_messages, "]");

        // Update messages (simplified: just user tool results)
        snprintf(messages, sizeof(messages), "[{\"role\":\"user\",\"content\":\"%s\"},{\"role\":\"assistant\",\"content\":%s},{\"role\":\"user\",\"content\":%s}]",
            escaped, "[]", new_messages);
    }

    printf("\n");
    return 0;
}
