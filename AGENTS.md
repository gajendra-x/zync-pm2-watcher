<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- PM2 plugin UI depends only on the `Pm2Adapter` interface (src/lib/pm2/types.ts); mock lives in mock-adapter.ts — swap in an SSH-backed adapter for Zync without touching UI.
- Plugin layout uses container queries (@container), not viewport breakpoints, because it lives in a resizable Zync pane.
