# Z.AI GLM API Performance Report

**Test Date**: 2026-01-22
**Account Type**: Max Yearly
**API Endpoint**: https://api.z.ai/api/anthropic

---

## Available Models

| Model | Type | Context | Max Output | Price (in/out per 1M) | Status |
|-------|------|---------|------------|----------------------|--------|
| glm-4.7 | Text | 204,800 | 131,072 | $0.60 / $2.20 | ✅ |
| glm-4.7-flash | Text | 204,800 | 131,072 | FREE | ✅ |
| glm-4.6 | Text | 200,000 | 131,072 | $0.60 / $2.20 | ✅ |
| glm-4.6v | Vision | 200,000 | 131,072 | $0.30 / $0.90 | ✅ |
| glm-4.6v-flash | Vision | 200,000 | 131,072 | FREE | ✅ |
| glm-4.5 | Text | 131,072 | 131,072 | $0.60 / $2.20 | ✅ |
| glm-4.5-air | Text | 131,072 | 131,072 | $0.20 / $1.10 | ✅ |
| glm-4.5-flash | Text | 131,072 | 131,072 | FREE | ✅ |
| glm-4.5v | Vision | 131,072 | 131,072 | $0.60 / $2.20 | ✅ |

### Unavailable Models (require upgrade)
- glm-4.7-flashx, glm-4.6v-flashx, glm-4.5-x, glm-4.5-airx
- glm-4, glm-4-plus, glm-4-0520 (legacy)

---

## Latency Benchmarks

### 3-Run Average (100 token output task)

| Model | Run 1 | Run 2 | Run 3 | Average | Throughput |
|-------|-------|-------|-------|---------|------------|
| glm-4.5 | 2075ms | 1423ms | 2165ms | **1887ms** | 47.1 tok/s |
| glm-4.5-air | 1441ms | 1544ms | 1346ms | **1443ms** | 69.3 tok/s |
| glm-4.5-flash | 2564ms | 5152ms | 17031ms | **8249ms** | 12.0 tok/s |
| glm-4.5v | 1699ms | 1541ms | 2786ms | **2008ms** | 40.8 tok/s |
| glm-4.6 | 1605ms | 2245ms | 1315ms | **1721ms** | 31.3 tok/s |
| glm-4.6v | 2057ms | 2626ms | 1983ms | **2222ms** | 25.6 tok/s |
| glm-4.6v-flash | 1011ms | 1259ms | 1967ms | **1412ms** | 34.7 tok/s |
| glm-4.7 | 2250ms | 1511ms | 1469ms | **1743ms** | 31.5 tok/s |
| glm-4.7-flash | 2727ms | 4725ms | 4522ms | **3991ms** | 12.2 tok/s |

### Latency Rankings

1. **glm-4.6v-flash** - 1412ms (fastest, FREE)
2. **glm-4.5-air** - 1443ms (best value)
3. **glm-4.6** - 1721ms
4. **glm-4.7** - 1743ms (flagship)
5. **glm-4.5** - 1887ms
6. **glm-4.5v** - 2008ms
7. **glm-4.6v** - 2222ms
8. **glm-4.7-flash** - 3991ms (FREE)
9. **glm-4.5-flash** - 8249ms (FREE, slowest)

### Throughput Rankings

1. **glm-4.5-air** - 69.3 tok/s (best)
2. **glm-4.5** - 47.1 tok/s
3. **glm-4.5v** - 40.8 tok/s
4. **glm-4.6v-flash** - 34.7 tok/s
5. **glm-4.7** - 31.5 tok/s
6. **glm-4.6** - 31.3 tok/s
7. **glm-4.6v** - 25.6 tok/s
8. **glm-4.7-flash** - 12.2 tok/s
9. **glm-4.5-flash** - 12.0 tok/s

---

## Rate Limits

### Concurrent Request Limits

| Parallel Requests | Success | Failed | Success Rate | Total Time |
|-------------------|---------|--------|--------------|------------|
| 5 | 5 | 0 | **100%** | 1520ms |
| 10 | 8 | 2 | 80% | 4772ms |
| 20 | 11 | 9 | 55% | 1111ms |
| 50 | 11 | 39 | 22% | 3793ms |

**Effective Concurrency Limit: 5-8 parallel requests**

Error message when exceeded:
```
"High concurrency usage of this API, please reduce concurrency or contact customer service to increase limits"
```

### Sequential Request Rate

| Metric | Value |
|--------|-------|
| Test: 30 sequential requests | 28 success / 2 failed |
| Total time | 75 seconds |
| **Estimated RPM** | ~22 requests/minute |

---

## Token Limits

| Parameter | Value | Status |
|-----------|-------|--------|
| Max input context (glm-4.7) | 204,800 tokens | ✅ Tested |
| Max input context (glm-4.6) | 200,000 tokens | ✅ Tested |
| Max input context (glm-4.5) | 131,072 tokens | ✅ Tested |
| Max output tokens | 131,072 tokens | ✅ Tested |

### max_tokens Parameter Test

| max_tokens | Status |
|------------|--------|
| 1,000 | ✅ OK |
| 4,096 | ✅ OK |
| 8,192 | ✅ OK |
| 16,384 | ✅ OK |
| 32,768 | ✅ OK |
| 65,536 | ✅ OK |
| 131,072 | ✅ OK |

---

## API Parameters

### Temperature

| Value | Status |
|-------|--------|
| 0.0 | ✅ OK |
| 0.5 | ✅ OK |
| 1.0 | ✅ OK |
| 2.0 | ❌ "Invalid API parameter" |

**Valid range: 0.0 - 1.0**

---

## Feature Support

| Feature | Status | Notes |
|---------|--------|-------|
| Tool Use | ✅ | Full support, proper `tool_use` stop_reason |
| System Messages | ✅ | Works correctly |
| Streaming (SSE) | ✅ | Standard Anthropic format |
| Vision (Images) | ✅ | glm-4.5v, glm-4.6v, glm-4.6v-flash |
| JSON Output | ✅ | Reliable structured output |
| Multi-turn | ✅ | Conversation history preserved |
| Chinese | ✅ | Native support (Zhipu AI) |
| Context Caching | ✅ | 82% discount on cached tokens |

---

## Pricing Summary

### Paid Models

| Model | Input/1M | Output/1M | Cached/1M |
|-------|----------|-----------|-----------|
| glm-4.7 | $0.60 | $2.20 | $0.11 |
| glm-4.6 | $0.60 | $2.20 | $0.11 |
| glm-4.6v | $0.30 | $0.90 | $0.05 |
| glm-4.5 | $0.60 | $2.20 | $0.11 |
| glm-4.5-air | $0.20 | $1.10 | $0.03 |
| glm-4.5v | $0.60 | $2.20 | $0.11 |

### Free Models

| Model | Input | Output | Notes |
|-------|-------|--------|-------|
| glm-4.7-flash | FREE | FREE | Slower (~4s latency) |
| glm-4.6v-flash | FREE | FREE | Vision, fast (~1.4s) |
| glm-4.5-flash | FREE | FREE | Slowest (~8s latency) |

---

## Recommendations

### By Use Case

| Use Case | Recommended Model | Reason |
|----------|-------------------|--------|
| **Coding/Agent** | glm-4.7 | Best quality, flagship |
| **Cost Optimization** | glm-4.5-air | 67% cheaper, fast |
| **Free Usage** | glm-4.6v-flash | Fast AND free |
| **Vision Tasks** | glm-4.6v | Best image quality |
| **Free Vision** | glm-4.6v-flash | No cost |
| **Max Throughput** | glm-4.5-air | 69.3 tok/s |
| **Lowest Latency** | glm-4.6v-flash | 1412ms avg |

### Configuration for nano-opencode

```bash
# Recommended .env configuration
ANTHROPIC_API_KEY=your_z_ai_key
ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
MODEL=glm-4.7

# For cost savings
MODEL=glm-4.5-air

# For free usage
MODEL=glm-4.7-flash
```

---

## Comparison with Claude

| Metric | GLM-4.7 | Claude Sonnet 4 |
|--------|---------|-----------------|
| Context Window | 204,800 | 200,000 |
| Max Output | 131,072 | 8,192 |
| Input Price/1M | $0.60 | $3.00 |
| Output Price/1M | $2.20 | $15.00 |
| Latency | ~1.7s | ~1.5s |
| Tool Use | ✅ | ✅ |
| Vision | ✅ (separate model) | ✅ |

**Cost Savings: ~80% cheaper than Claude**

---

## Test Environment

- **Test Date**: 2026-01-22
- **Location**: Linux server
- **Method**: curl with timing
- **Runs per test**: 3 (averaged)

---

## Changelog

- 2026-01-22: Initial report created
