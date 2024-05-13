
import HTML_TEMPLATE from './index.html';
import { fetchTimeEntries, renderWeeklyHTML } from './redmine.js';
import { sendOpenAIRequest } from './openai.js';

/**
 * Handles the summary request by fetching time entries, rendering HTML, and generating a summary using OpenAI.
 * @param {Request} req - The request object.
 * @param {Object} env - The environment variables.
 * @param {Object} ctx - The context object.
 * @returns {Promise<string>} - A promise that resolves to the response content.
 */
async function handleSummaryRequest(req, env, ctx) {
    try {
        const {
            REDMINE_BASE,
            AI_ENDPOINT,
            AI_API_KEY,
            AI_API_MODEL,
        } = env;
        const { key } = await req.json();
        const entries = await fetchTimeEntries(REDMINE_BASE, key, 'me');
        let html = renderWeeklyHTML(entries);
        if (html.length === 0) {
            return '小老弟，你这周没干活啊？';
        }
        if (AI_ENDPOINT && AI_API_KEY && AI_API_MODEL) {
            const prompt = `根据最近一周的工作记录，总结一下本周的工作内容不要超过100字，不要引用原文。下面是最近一周的工作记录：\n${html}`;
            const summary = await sendOpenAIRequest(AI_API_KEY, AI_ENDPOINT, AI_API_MODEL, prompt).then(e => `<p>${e}</p>`).catch(e => '');
            if (summary) {
                html += summary;
            }
        }
        return html;
    } catch (e) {
        console.error(e);
        console.error(e.stack);
        return e.message;
    }
}

export default {
    async fetch(req, env, ctx) {
        if (req.method === 'POST') {
            const res = await handleSummaryRequest(req, env, ctx);
            return new Response(res, { status: 500, headers: { 'Content-Type': 'text/plain' } })
        }
        return new Response(HTML_TEMPLATE.replace('$$REDMINE_BASE$$', env.REDMINE_BASE), {
            headers: {
                'Content-Type': 'text/html'
            }
        });
    }
};
