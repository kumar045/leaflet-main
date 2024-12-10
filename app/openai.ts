import { OpenAI } from "openai";  // Ensure you import the OpenAI class correctly

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

