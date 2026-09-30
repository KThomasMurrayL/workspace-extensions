# Flow

Flow charts and project planning inside VS Code. Everything is stored in your workspace at
`flow/flow.json`.

## Features

- **Node canvas** — double-click the canvas (or press **+ Node**) to add a step.
- **Connections** — hover a node and drag the round port onto another node to draw an arrow.
- **Labels** — double-click an arrow to name the transition (`spec`, `approve`, `test`, …).
- **Multiple flows** with a switcher, rename and delete.
- **Pan & zoom** — drag empty space to pan, pinch/⌘+scroll or the −/+ buttons to zoom, **Fit** to frame everything.
- **Copy outline** — turns the flow into a markdown outline you can paste into a plan or PR.
- Data is saved automatically on every change to `flow/flow.json`.

## How to use

- Click the **Flow** icon in the activity bar, or run **Flow: Open Flow** to open it as a full editor tab.
- Drag from a node's right-hand dot to another node to connect them.
- Double-click a node to rename it; double-click an edge to label it.
- Other commands: **Flow: New Flow**, **Flow: New Node**, **Flow: Refresh**.

## Planning a product / project

A flow doubles as a plan: put the stages in nodes (Idea → Plan → Build → Ship), connect
them, and label the hand-offs. Use **Copy outline** to get a nested markdown checklist of
the whole plan, then paste it into your README or issue tracker.

## Run this extension (development)

> On this Mac `F5` hangs ("Extension host did not start in 10 seconds") because the
> debugger fails to attach. Use **Run menu → Run Without Debugging**, or run
> `../run-flow.sh` from a terminal instead.

1. Open this folder (`flow`) in VS Code.
2. Run **Run → Run Without Debugging** (or `./run-flow.sh` from the parent folder).
3. In the new Extension Development Host window, open any folder — the Flow view appears in the activity bar.

## Install permanently

Download `flow-0.1.1.vsix` from <https://kthomasmurrayl.github.io/workspace-extensions/>, or:

```bash
npx --yes @vscode/vsce package --allow-missing-repository
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension flow-0.1.1.vsix
```

## Storage format

`flow/flow.json` is plain JSON — commit it to git to share plans with your team.

```json
{
  "version": 1,
  "lastFlowId": "…",
  "flows": [
    {
      "id": "…",
      "name": "Product Flow",
      "nodes": [{ "id": "…", "x": 80, "y": 140, "text": "Idea" }],
      "edges": [{ "id": "…", "from": "…", "to": "…", "label": "research" }]
    }
  ]
}
```
