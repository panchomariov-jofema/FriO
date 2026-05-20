import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import {vertexAI} from '@genkit-ai/vertexai';

const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
const isGoogleAIEnabled = !!apiKey;

const plugins = [];
let defaultModel = '';

if (isGoogleAIEnabled) {
  plugins.push(googleAI({ apiKey }));
  defaultModel = 'googleai/gemini-1.5-flash';
} else {
  plugins.push(
    vertexAI({
      projectId: process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || 'frigomanagerm1-96752421-f2f17',
      location: 'us-central1',
    })
  );
  defaultModel = 'vertexai/gemini-1.5-flash';
}

export const ai = genkit({
  plugins,
  model: defaultModel,
});

export const getModel = () => defaultModel;

