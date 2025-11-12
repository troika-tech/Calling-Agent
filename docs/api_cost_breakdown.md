# API Cost Breakdown for Calling Agent Setups

This document provides an estimated per-minute cost breakdown for two API configurations in the Calling Agent project. Costs are based on provider pricing (as of 2023—verify latest rates). Estimates assume a 1-minute conversation with ~30 seconds user speech, ~30 seconds agent response, 150 WPM speech rate (~750 characters/30s), and ~200 input/output tokens per minute for the LLM.

## Key Assumptions
- Balanced speaking: ~30 seconds user speech (STT) and ~30 seconds agent response (LLM + TTS).
- LLM: ~200 input tokens + ~200 output tokens per minute.
- No additional fees (e.g., data transfer, taxes).
- Actual costs vary by usage; track with logging for precision.

## Setup 1: OpenAI GPT-4o Mini + Deepgram Flux + Google WaveNet TTS
- **OpenAI GPT-4o Mini**: $0.150/1M input tokens; $0.600/1M output tokens → ~$0.00015/min.
- **Deepgram Flux**: $0.0077/min audio → ~$0.00385/min (for 0.5 min speech).
- **Google WaveNet TTS**: $0.000004/character → ~$0.003/min (for ~750 characters).
- **Total**: ~$0.007/min.
  - Best for low-cost, English-only real-time conversational use.

## Setup 2: OpenAI GPT-4o Mini + Deepgram Nova-3 (Multilingual) + Google WaveNet TTS
- **OpenAI GPT-4o Mini**: ~$0.00015/min (same as above).
- **Deepgram Nova-3 Multilingual**: $0.0092/min audio → ~$0.0046/min (for 0.5 min speech).
- **Google WaveNet TTS**: ~$0.003/min (same as above).
- **Total**: ~$0.00775/min.
  - Slightly higher cost but supports multiple languages, noise, and crosstalk.

## Additional Notes
- **Cost-Saving Tips**: Optimize prompts for fewer tokens; use shorter responses; consider cheaper alternatives like GPT-3.5 Turbo.
- **Alternatives**: Nova-3 Monolingual ($0.0077/min) if multilingual isn't needed yet.
- For multilingual expansion, dynamically set Deepgram's `language` param based on detection.

Verify pricing with: [OpenAI](https://openai.com/pricing), [Deepgram](https://deepgram.com/pricing), [Google Cloud TTS](https://cloud.google.com/text-to-speech/pricing).
