---
name: youtube-skill
description: Umbrella over the eleven yt-* YouTube channel skills (script and hooks, titles and thumbnails, retention, Shorts, SEO, chapters, channel audit, weekly plan, niche research, comments, edit lists) and their Python scorers. Use whenever the user asks for anything YouTube-video related, then load the matching yt-* skill for the specific job.
---

# YouTube Skill

This wraps the MIT skill pack [youtube-agent-skill](https://github.com/Jakeschincariol/youtube-agent-skill),
installed in this skills root as the `yt-*` directories. Each `yt-*` directory holds a `SKILL.md` and its Python
helper scripts.

## Route the request

| Request | Load |
|---|---|
| Video script, hook, opening line | `yt-script` |
| Title and thumbnail as one pairing | `yt-package` |
| Retention export analysis | `yt-retention` |
| Shorts hiding inside a long video | `yt-shorts` |
| Description, tags, search intent | `yt-seo` |
| Chapters from a transcript | `yt-chapters` |
| Whole-channel audit ending in one fix | `yt-audit` |
| Weekly content plan | `yt-plan` |
| What is working in the niche | `yt-viral` |
| Comment triage and replies | `yt-comment` |
| Transcript into an edit decision list | `yt-edit` |

Load the specific skill with the skill tool and follow its instructions; this umbrella only routes and states
the shared rules that apply to every one of them.

## Shared rules

- **Voice profile.** The skills read `~/.claude/youtube/voice.md` when it exists. If it is missing, ask for
  three of the user's own videos, infer the voice, and write the file before writing a script — a script in
  the wrong voice is worse than no script.
- **Python scorers** sit beside each `SKILL.md` (`hookscore.py`, `title.py`, `deadair.py`, `chapters.py`,
  `retention.py`, `swipe.py`). Run them from the skill directory with `python` on Windows or `python3` on
  macOS/Linux. They are heuristics, not predictors: a low score is a reason to look again, not proof, and a
  high score is not a promise.
- **Nothing publishes.** Every skill ends with copy the user uploads themselves; never claim a video, title, or
  description was posted.
- **Never invent numbers** — views, retention percentages, results, or sources. Ask for the export, or write
  the sentence without the figure.

## Output

Answer in the user's language, keep the structure tight, and end with the single next concrete action.
