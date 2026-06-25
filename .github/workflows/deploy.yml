name: Deploy Garage Sale

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # Gera o config.js com as credenciais dos GitHub Secrets
      # As credenciais NUNCA ficam no código — ficam nos Secrets do repositório
      - name: Gerar config.js com credenciais seguras
        run: |
          cat > config.js << EOF
          window.SUPABASE_URL = '${{ secrets.SUPABASE_URL }}';
          window.SUPABASE_KEY = '${{ secrets.SUPABASE_KEY }}';
          EOF

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
