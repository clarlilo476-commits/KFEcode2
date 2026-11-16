export const sample = {
  name: 'orbit-studio',
  files: {
    'index.html': `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Orbit Studio</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <main class="orbit">
    <nav class="orbit-nav">
      <a class="brand" href="#">◈ &nbsp; Orbit Studio</a>
      <button class="menu" aria-label="Menu" aria-expanded="false">☰</button>
    </nav>

    <section class="hero">
      <div class="orbital" aria-hidden="true">
        <span class="ring ring-one"></span>
        <span class="ring ring-two"></span>
        <span class="ring ring-three"></span>
        <span class="planet"></span>
      </div>

      <div class="hero-copy">
        <p class="eyebrow">ESTÚDIO DIGITAL INDEPENDENTE</p>
        <h1>Ideias em<br><em>órbita.</em></h1>
        <p class="intro">Projetamos experiências digitais para um mundo em movimento.</p>
        <a class="cta" href="#projetos">Explorar projetos <span>↗</span></a>
      </div>
    </section>
    <section id="projetos" hidden><h2>Projetos selecionados</h2><p>Design, desenvolvimento e experimentos digitais.</p></section>
    <footer><span>ORBIT STUDIO</span><span>DESIGN &amp; CÓDIGO</span></footer>
  </main>
  <script src="js/main.js" defer></script>
</body>
</html>
`,
    'css/styles.css': `:root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; color: #f1f5f9; background: #111820; }
* { box-sizing: border-box; }
body { margin: 0; }
.orbit { min-height: 100svh; position: relative; display: flex; flex-direction: column; overflow: hidden; background: radial-gradient(ellipse at 74% 35%, #1c3449, #151e28 55%, #111820 95%); }
.orbit-nav { display: flex; align-items: center; justify-content: space-between; margin: 0 7%; padding: 18px 0; border-bottom: 1px solid #ffffff15; position: relative; z-index: 2; }
.brand { color: #e6edf5; font-weight: 700; text-decoration: none; font-size: 13px; }
.menu { border: 1px solid #ffffff20; background: #ffffff07; border-radius: 6px; padding: 3px 7px; color: #d3e0ed; cursor: pointer; }
.hero { position: relative; display: flex; align-items: center; flex: 1; padding: 132px 8% 45px; min-height: 490px; isolation: isolate; }
.hero::before { content: ""; position: absolute; inset: 0; opacity: .55; background-image: radial-gradient(circle, #a9c8e7 0.7px, transparent 1.4px), radial-gradient(circle, #7aa7cd 0.5px, transparent 1px); background-size: 71px 64px, 47px 48px; background-position: 8px 14px, 31px 32px; mask-image: linear-gradient(black, transparent 85%); z-index: -1; }
.orbital { position: absolute; width: min(95%, 400px); height: 320px; left: 50%; top: 38%; transform: translate(-47%, -53%); z-index: -1; }
.ring { position: absolute; width: 88%; height: 42%; left: 6%; top: 26%; border: 1px solid #8ab7df70; border-radius: 50%; transform: rotate(-33deg); box-shadow: 0 0 14px #447ab048, inset 0 0 14px #447ab030; }
.ring-two { transform: rotate(-33deg) scale(.82); border-color: #8ab7df64; }
.ring-three { transform: rotate(-33deg) scale(1.14); border-color: #689bcd36; }
.planet { position: absolute; width: 30%; aspect-ratio: 1; left: 36%; top: 24%; border-radius: 50%; background: radial-gradient(circle at 35% 25%, #9ac4e7 1%, #497faf 28%, #2c5076 53%, #17293d 76%); box-shadow: 0 0 55px #497fae7a, inset 0 0 11px #84b2da74; }
.hero-copy { margin-top: 100px; }
.eyebrow { color: #a0bfdb; font: 600 8px/1.5 ui-monospace, monospace; letter-spacing: .18em; margin: 0 0 14px; }
h1 { font-size: clamp(42px, 14vw, 76px); letter-spacing: -.08em; line-height: .93; margin: 0; }
h1 em { font-style: normal; color: #e6a776; }
.intro { color: #b5c4d4; line-height: 1.65; font-size: 12px; max-width: 245px; margin: 19px 0; }
.cta { display: inline-flex; align-items: center; gap: 12px; text-decoration: none; font-size: 10px; font-weight: 700; border-radius: 6px; padding: 10px 12px; background: #edb48a; color: #221810; }
#projetos { margin: 0 8% 24px; padding: 18px; border: 1px solid #ffffff18; border-radius: 8px; }
#projetos h2 { margin-top: 0; }
#projetos p { color: #b5c4d4; }
footer { display: flex; justify-content: space-between; gap: 12px; margin: 0 7%; border-top: 1px solid #ffffff15; padding: 14px 0; font: 8px ui-monospace, monospace; letter-spacing: .12em; color: #a6b7c8; }
`,
    'js/main.js': `const projects = document.querySelector('#projetos');
const menu = document.querySelector('.menu');

function showProjects() {
  projects.hidden = false;
  menu.setAttribute('aria-expanded', 'true');
  projects.scrollIntoView({ behavior: 'smooth' });
}

document.querySelector('.cta').addEventListener('click', (event) => {
  event.preventDefault();
  showProjects();
});

menu.addEventListener('click', () => {
  if (projects.hidden) showProjects();
  else {
    projects.hidden = true;
    menu.setAttribute('aria-expanded', 'false');
  }
});

console.info('Orbit Studio inicializado.');
`,
    'README.md': '# Orbit Studio\n\nProjeto de exemplo do KFEcode. Abra index.html no navegador ou use Executar.\n',
    'package.json': '{\n  "name": "orbit-studio",\n  "version": "1.0.0",\n  "private": true,\n  "scripts": { "test": "node --test", "check": "node --check js/main.js" }\n}\n',
  },
  folders: ['assets','css','js'],
};
