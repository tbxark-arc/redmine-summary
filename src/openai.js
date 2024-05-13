
/**
 * Sends a request to the OpenAI API using the specified key, endpoint, model, and prompt.
 * @param {string} key - The API key for authentication.
 * @param {string} endpoint - The API endpoint URL.
 * @param {string} model - The name of the model to use for generating the response.
 * @param {string} prompt - The user's prompt for the AI model.
 * @returns {Promise<string>} - A promise that resolves to the generated response from the AI model.
 */
export async function sendOpenAIRequest(key, endpoint, model, prompt) {
    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ]
        })
    });
    const body = await resp.json();
    return body?.choices?.[0]?.message?.content || '';
}