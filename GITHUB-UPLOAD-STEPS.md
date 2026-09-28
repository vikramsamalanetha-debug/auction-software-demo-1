# Upload HammerList to GitHub

1. Create a new empty GitHub repository named `hammerlist-demo`.
2. Extract `HammerList-GitHub-Upload-Bundle.zip` on a computer.
3. Upload **the contents inside the extracted folder**, including `.github`, `src`, `worker`, `scripts`, `index.html`, `package.json`, `wrangler.toml`, and `README.md`.
4. Commit the files to the `main` branch.
5. Connect the Cloudflare plugin in ChatGPT so the public Worker and required secrets can be configured.
6. In the GitHub repository settings, add the secrets listed in `README.md`.

`index.html` is included at the top level for easy inspection. The secure deployment rebuilds it from `src/index.html`, `src/styles.css`, and `src/app.js`.

Do not publish an AI key in GitHub source or GitHub Pages.
