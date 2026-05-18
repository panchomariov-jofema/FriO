import {genkit} from 'genkit';
import {vertexAI} from '@genkit-ai/vertexai';

export const ai = genkit({
  plugins: [
    vertexAI({
      projectId: 'frigomanagerm1-96752421-f2f17',
      location: 'us-central1',
    }),
  ],
  model: 'vertexai/gemini-1.5-flash',
});
