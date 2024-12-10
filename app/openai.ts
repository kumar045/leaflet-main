import { OpenAI } from "openai";  // Ensure you import the OpenAI class correctly

const OPENAI_API_KEY = "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";

export const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

