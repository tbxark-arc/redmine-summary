/**
 * @typedef {Object} TimeRange
 * @property {string} from - The start date of the time range.
 * @property {string} to - The end date of the time range.
 */
/**
 * @typedef {Object} Issue
 * @property {number} issue_id - The ID of the issue.
 * @property {string} subject - The subject of the issue.
 * @property {string} type - The type of the issue.
 */
/**
 * @typedef {Object.<number, Issue>} IssuesMap
 */
/**
 * @typedef {Object} Entry
 * @property {number} hours - The number of hours spent on the issue.
 * @property {string} comment - The comment associated with the time entry.
 */
/**
 * @typedef {Object} TimeEntry
 * @property {number} issue_id - The ID of the issue.
 * @property {string} subject - The subject of the issue.
 * @property {string} type - The type of the issue.
 * @property {Array<Entry>} entries - The time entries for the issue.
 * @property {number} hours - The total hours spent on the issue.
 */

/**
 * Returns the time range for the current week.
 * 
 * @returns {TimeRange} - The time range for the current week.
 */
function thisWeekTimeRange() {
    const today = new Date();
    const sundayOfThisWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const saturdayOfThisWeek = new Date(today.setDate(today.getDate() + 6));
    const from = sundayOfThisWeek.toISOString().split('T')[0];
    const to = saturdayOfThisWeek.toISOString().split('T')[0];
    return { from, to };
}

/**
 * Fetches time entries from the Redmine API within a specified date range.
 *
 * @param {string} endpoint - The Redmine API endpoint.
 * @param {string} apikey - The API key for authentication.
 * @param {string} [user='me'] - The user ID for which to fetch time entries. Defaults to 'me'.
 * @param {TimeRange} [range=thisWeekTimeRange()] - The time range for which to fetch time entries. Defaults to the current week.
 * @returns {Promise<Array<TimeEntry>>} - A promise that resolves to an array of time entries.
 */
export async function fetchTimeEntries(endpoint, apikey, user = 'me', range = thisWeekTimeRange()) {
    const url = `${endpoint}/time_entries.json?from=${range.from}&to=${range.to}&limit=100&user_id=${user}`;
    const req = new Request(url, {
        headers: {
            'X-Redmine-API-Key': apikey
        }
    });
    const res = await fetch(req).then(res => res.json());
    const entries = res.time_entries;
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
 * @returns {Promise<IssuesMap>} - A promise that resolves to an object containing the fetched issues.
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
        ret[id] = {
            issue_id: id,
            subject: res.issue.subject,
            type: res.issue.tracker.name
        };
    }
    return ret;
}

/**
 * Converts a number to its Chinese representation.
 *
 * @param {number} num - The number to convert.
 * @returns {string} The Chinese representation of the number.
 */
function numberToChinese(num) {
    const chineseDigits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const units = ['', '十', '百', '千', '万', '亿'];

    if (num < 10) {
        return chineseDigits[num];
    }

    let parts = [];
    while (num > 0) {
        parts.push(num % 10);
        num = Math.floor(num / 10);
    }

    let chineseNum = '';
    let zeroCount = 0;
    for (let i = 0; i < parts.length; i++) {
        const digit = parts[i];
        if (digit === 0) {
            zeroCount++;
        } else {
            if (zeroCount > 0) {
                chineseNum = chineseDigits[0] + chineseNum;
                zeroCount = 0;
            }
            chineseNum = chineseDigits[digit] + units[i] + chineseNum;
        }
    }

    // 处理10-19的情况
    if (chineseNum.startsWith('一十')) {
        chineseNum = chineseNum.substring(1);
    }

    return chineseNum;
}

/**
 * Groups time entries by type.
 *
 * @param {Array} list - The list of time entries.
 * @returns {Object.<string, Array<TimeEntry>>} - An object containing time entries grouped by type.
 */
function timeEntriesToGroup(list) {
    const typeGroup = {};
    for (const item of list) {
        if (!typeGroup[item.type]) {
            typeGroup[item.type] = [];
        }
        typeGroup[item.type].push(item);
    }
    return typeGroup;
}

/**
 * Renders the weekly HTML summary based on the provided list of items.
 *
 * @param {Array<TimeEntry>} list - The list of items to render the summary for.
 * @returns {string} The HTML representation of the weekly summary.
 */
export function renderWeeklyHTML(list) {
    let html = '';
    const typeGroup = timeEntriesToGroup(list);

    for (const type in typeGroup) {
        html += `<h4>${type}</h4>\n`;
        html += `<ul>\n`;
        const entries = typeGroup[type]
        entries.sort((a, b) => a.issue_id - b.issue_id);
        for (let i = 0; i < entries.length; i++) {
            const item = entries[i];
            html += `<li><h5>${numberToChinese(i + 1)}. ${item.subject} (issue: ${item.issue_id})</h5></li>\n`;
            if (item.entries && item.entries.length > 0) {
                html += `<ul>\n`;
                let j = 0;
                for (const entry of item.entries) {
                    if (entry.comment) {
                        j += 1;
                        html += `<li>${j}. ${entry.comment}</li>\n`;
                    }
                }
                html += `</ul>\n`;
            }
        }
        html += `</ul>\n`;
    }
    return html;
}
