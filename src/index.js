
import HTML_TEMPLATE from './index.html';
/**
 * Fetches time entries from the Redmine API within a specified date range.
 *
 * @param {string} endpoint - The Redmine API endpoint.
 * @param {string} apikey - The API key for authentication.
 * @param {string} [user='me'] - The user ID for which to fetch time entries. Defaults to 'me'.
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of time entries.
 */
async function fetchTimeEntries(endpoint, apikey, user = 'me') {
    const today = new Date();
    const sundayOfThisWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const saturdayOfThisWeek = new Date(today.setDate(today.getDate() + 6));
    const from = sundayOfThisWeek.toISOString().split('T')[0];
    const to = saturdayOfThisWeek.toISOString().split('T')[0];
    const url = `${endpoint}/time_entries.json?from=${from}&to=${to}&limit=100&user_id=${user}`;
    console.log(url);
    const req = new Request(url, {
        headers: {
            'X-Redmine-API-Key': apikey
        }
    });
    const res = await fetch(req).then(res => res.json());
    const entries = res.time_entries;
    console.log(entries);
    const issuesMap = await fetchIssuesById(endpoint, apikey, entries.map(entry => entry.issue.id));

    entries.forEach(entry => {
        const issueId = entry.issue.id;
        if (!issuesMap[issueId].entries) {
            issuesMap[issueId].entries = [];
        }
        if (entry.comments) {
            issuesMap[issueId].entries.push({
                hours: entry.hours,
                comment: entry.comments
            });
        }
        issuesMap[issueId].hours = (issuesMap[issueId].hours || 0) + entry.hours;
    });

    const issuesList = Object.values(issuesMap);
    issuesList.sort((a, b) => {
        if (a.type === b.type) {
            return a.hours > b.hours;
        }
        return a.type > b.type;
    });

    return issuesList;
}


/**
 * Fetches Redmine issues by their IDs.
 *
 * @param {string} endpoint - The Redmine API endpoint.
 * @param {string} apikey - The API key for authentication.
 * @param {Array<number>} ids - An array of issue IDs to fetch.
 * @returns {Promise<Object>} - A promise that resolves to an object containing the fetched issues.
 */
async function fetchIssuesById(endpoint, apikey, ids) {
    const ret = {};
    for (const id of ids) {
        if (ret[id]) {
            continue;
        }
        const url = `${endpoint}/issues/${id}.json`;
        const req = new Request(url, {
            headers: {
                'X-Redmine-API-Key': apikey
            }
        });
        const res = await fetch(req).then(res => res.json());
        console.log(res);
        ret[id] = {
            issue_id: id,
            subject: res.issue.subject,
            type: res.issue.tracker.name
        };
    }
    return ret;
}

/**
 * Renders the weekly HTML summary based on the provided list of items.
 *
 * @param {Array} list - The list of items to render the summary for.
 * @returns {string} The HTML representation of the weekly summary.
 */
function renderWeeklyHTML(list) {
    let html = '';
    const typeGroup = {};
    for (const item of list) {
        if (!typeGroup[item.type]) {
            typeGroup[item.type] = [];
        }
        typeGroup[item.type].push(item);
    }
    for (const type in typeGroup) {
        html += `<h4>${type}</h4>\n`;
        html += `<ol>\n`;
        for (const item of typeGroup[type]) {
            html += `<li><h5>${item.subject} (issue: ${item.issue_id})</h5></li>\n`;
            if (item.entries) {
                html += `<ol>\n`;
                for (const entry of item.entries) {
                    if (entry.comment) {
                        html += `<li>${entry.comment}</li>\n`;
                    }
                }
                html += `</ol>\n`;
            }
        }
        html += `</ol>\n`;
    }
    return html;
}

/**
 * Sends a request to the OpenAI API using the specified key, endpoint, model, and prompt.
 * @param {string} key - The API key for authentication.
 * @param {string} endpoint - The API endpoint URL.
 * @param {string} model - The name of the model to use for generating the response.
 * @param {string} prompt - The user's prompt for the AI model.
 * @returns {Promise<string>} - A promise that resolves to the generated response from the AI model.
 */
async function sendOpenAIRequest(key, endpoint, model, prompt) {
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
