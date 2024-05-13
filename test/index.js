import { fetchTimeEntries, renderWeeklyHTML } from "../src/redmine.js";
import readline from "node:readline"

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


rl.question("Enter the base URL of your Redmine instance: ", function (url) {
    rl.question("Enter your Redmine API key: ", function (key) {
        fetchTimeEntries(url, key, "me", {
            from: "2024-05-05",
            to: "2024-05-11"
        }).then(entries => {
            console.log(entries);
            console.log(renderWeeklyHTML(entries));
            rl.close();
        })
        rl.close();
    });
});
