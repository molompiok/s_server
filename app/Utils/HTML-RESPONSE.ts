export function redirectWithHtml(url: string): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Redirection...</title>
  <meta http-equiv="refresh" content="5;url=${url}">
  <style>
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: sans-serif;
      background-color: #f9fafb;
      color: #333;
    }
    .spinner {
      width: 48px;
      height: 48px;
      border: 5px solid #ccc;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>Redirection en cours...</p>
  <noscript>
    <p>JavaScript est désactivé. Si vous n’êtes pas redirigé automatiquement, <a href="${url}">cliquez ici</a>.</p>
  </noscript>
  <script>
    // Redirection immédiate côté client
    window.location.replace(${JSON.stringify(url)});
  </script>
</body>
</html>
`;
}
