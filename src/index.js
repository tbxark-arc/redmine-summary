
/**
 * Fetches time entries from the Redmine API within a specified date range.
 * 
 * @param {string} endpoint - The Redmine API endpoint.
 * @param {string} apikey - The API key for authentication.
 * @param {string} [user='me'] - The user ID for which to fetch time entries. Defaults to 'me'.
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of time entries.
 */
async function fetchTimeEntries(endpoint, apikey, user = 'me') {
    const today = new Date()
    const fromDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)
    const toDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6 - today.getDay())
    const from = fromDay.toISOString().split('T')[0]
    const to = toDay.toISOString().split('T')[0]
    const url = `${endpoint}/time_entries.json?from=${from}&to=${to}&limit=100&user_id=${user}`
    console.log(url)
    const req = new Request(url, {
        headers: {
            'X-Redmine-API-Key': apikey
        }
    })
    const res = await fetch(req).then(res => res.json())
    const entries = res.time_entries
    console.log(entries)
    const issuesMap = await fetchIssuesById(endpoint, apikey, entries.map(entry => entry.issue.id))

    entries.forEach(entry => {
        const issueId = entry.issue.id
        if (!issuesMap[issueId].entries) {
            issuesMap[issueId].entries = []
        }
        if (entry.comments) {
            issuesMap[issueId].entries.push({
                hours: entry.hours,
                comment: entry.comments
            })
        }
        issuesMap[issueId].hours = (issuesMap[issueId].hours || 0) + entry.hours
    })

    const issuesList = Object.values(issuesMap)
    issuesList.sort((a, b) => {
        if (a.type === b.type) {
            return a.hours > b.hours
        }
        return a.type > b.type
    })

    return issuesList
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
    const ret = {}
    for (const id of ids) {
        if (ret[id]) {
            continue
        }
        const url = `${endpoint}/issues/${id}.json`
        const req = new Request(url, {
            headers: {
                'X-Redmine-API-Key': apikey
            }
        })
        const res = await fetch(req).then(res => res.json())
        console.log(res)
        ret[id] = {
            issue_id: id,
            subject: res.issue.subject,
            type: res.issue.tracker.name
        }
    }
    return ret
}

/**
 * Renders the weekly HTML summary based on the provided list of items.
 *
 * @param {Array} list - The list of items to render the summary for.
 * @returns {string} The HTML representation of the weekly summary.
 */
function renderWeeklyHTML(list) {
    let html = ''
    const typeGroup = {}
    for (const item of list) {
        if (!typeGroup[item.type]) {
            typeGroup[item.type] = []
        }
        typeGroup[item.type].push(item)
    }
    for (const type in typeGroup) {
        html += `<h4>${type}</h4>\n`
        html += `<ul>\n`
        for (const item of typeGroup[type]) {
            html += `<li><h5>${item.subject} (issue: ${item.issue_id})</h5></li>\n`
            if (item.entries) {
                html += `<ul>\n`
                for (const entry of item.entries) {
                    if (entry.comment) {
                        html += `<li>${entry.comment}</li>\n`
                    }
                }
                html += `</ul>\n`
            }
        }
        html += `</ul>\n`
    }
    return html
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
            'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        }),
    });
    const body = await resp.json();
    return body?.choices?.[0]?.message?.content || '';
}

/**
 * Handles the summary request by fetching time entries, rendering HTML, and generating a summary using OpenAI.
 * @param {Request} req - The request object.
 * @param {Object} env - The environment variables.
 * @param {Object} ctx - The context object.
 * @returns {Response} - The response object.
 */
async function handleSummaryRequest(req, env, ctx) {
    try {
        const {
            REDMINE_BASE,
            AI_ENDPOINT,
            API_KEY
        } = env
        const model = 'gpt-3.5-turbo'
        const { key } = await req.json()
        const entries = await fetchTimeEntries(REDMINE_BASE, key, 'me')
        const html = renderWeeklyHTML(entries)
        const prompt = `根据最近一周的工作记录，总结一下本周的工作内容不要超过100字，不要引用原文。下面是最近一周的工作记录：\n${html}`
        const summary = await sendOpenAIRequest(API_KEY, AI_ENDPOINT, model, prompt).then(e => `<p>${e}</p>`).catch(e => '')
        return new Response(html + '\n\n' + summary, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    } catch (e) {
        return new Response(e.message, { status: 500, headers: { 'Content-Type': 'text/plain' } })
    }
}

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="An online preview tool for Testmail." />
    <meta name="author" content="TBXark" />
    <title>周报生成</title>
    <link
      href="https://unpkg.com/bootstrap@5.3.2/dist/css/bootstrap.min.css"
      rel="stylesheet"
    />
    <style>
        .container {
            padding: 10px;
        }
    </style>
    </head>
    <body>
        <div class="container">
            <h2>请输入您的 Redmine API 密钥</h2>
            <div style="display: flex; align-items: center; padding: 10px 0">
                <input type="text" class="form-control" id="api-key" placeholder="输入您的API密钥">
                <button type="submit" class="btn btn-primary" style="width: 150px; margin-left: 10px;">提交</button>
            </div>
            <p style="font-size: 15px;color: gray;">PS: 你可以在<a href="$$REDMINE_BASE$$/my/api_key">这里</a>找到你的API密钥.&nbsp;&nbsp;&nbsp;本项目的源码在<a href="https://github.com/TBXark/redmine-summary">Github</a>可以查看</p>
            <div id="output" class="well" style="margin-top: 20px;">
            </div>
        </div>
    </body>
    <script>
        document.querySelector('button').addEventListener('click', async () => {
            const key = document.querySelector('#api-key').value;
            const res = await fetch('/api/summary', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({key})
            });
            document.querySelector('#output').innerHTML = await res.text();
        });
    </script>
</html>
`

export default {
    async fetch(req, env, ctx) {
        if (req.method === 'POST') {
            return handleSummaryRequest(req, env, ctx)
        }
        return new Response(HTML_TEMPLATE.replace('$$REDMINE_BASE$$', env.REDMINE_BASE), {
            headers: {
                'Content-Type': 'text/html'
            }
        })
    }
}