# goblin-mode

A thin launcher for the [OpenAI Codex CLI](https://www.npmjs.com/package/@openai/codex) that strips the "never talk about goblins" clause from its system prompt before handing control to `codex`.

It works by dumping codex's live model catalog at startup (`codex debug models`), recursively removing any line mentioning goblins from every string in the catalog, writing the sanitized catalog to a temp file, and execing `codex -c model_catalog_json=<tmp>` with the rest of your arguments passed through unchanged.

## Requirements

- Node.js 18+
- `codex` on your `PATH` (`npm i -g @openai/codex`)

## Install

One-liner from GitHub (no clone, no publish needed):

```sh
npm i -g github:sofianel5/goblin-mode
```

Or run without installing:

```sh
npx -y github:sofianel5/goblin-mode -- <codex args>
```

From a local checkout:

```sh
git clone https://github.com/sofianel5/goblin-mode.git
cd goblin-mode
npm i -g .
```

## Usage

Use it exactly like `codex` — every argument is forwarded:

```sh
goblin-mode                       # interactive session, goblin clause stripped
goblin-mode "explain this repo"   # one-shot prompt
goblin-mode -m gpt-5.4 ...        # pick a different model; passthrough works
```

On startup it prints a one-line note to stderr telling you how many lines it stripped (or that it found none, in which case codex runs unchanged).

### Environment variables

- `GOBLIN_MODE_CODEX` — path to the `codex` binary if it's not on `PATH`.

## License

MIT
