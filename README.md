# redmine summary

This is a simple script to get the summary of the issues from redmine.

### Configuration
```
REDMINE_BASE = "http://your-redmine-url.com"
AI_ENDPOINT = "https://api.openai.com/v1/chat/completions"
API_KEY = "sk-"
```

### Deployment
This script is deployed on cloudflare workers. You can deploy it using the wrangler cli.
```shell
npm install
npm run deploy
```

### License
**redmine summary** is released under the MIT license. See [LICENSE](LICENSE) for details.
