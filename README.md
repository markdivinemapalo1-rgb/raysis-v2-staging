# Raysis V2 Staging

Isolated staging copy of the Raysis Printing House Management System V2.

- Source: `raysis-v2-combined-upgrade` development branch.
- This repository is separate from the live production repository.
- Browser records, cached profiles, and Supabase authentication use staging-specific keys.
- The app still connects to the existing Supabase project. Use only approved test accounts and test data; do not record live business transactions here.
- The PWA uses staging-specific service-worker cache names.
- The original Raysis logo is loaded from the source repository; an internet connection is needed to load that logo until its image asset is copied into this repository.
- GitHub Pages has not yet been enabled. Enable it in Settings → Pages, selecting Deploy from a branch (main, root) or GitHub Actions.
