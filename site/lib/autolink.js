// Contextual internal links, added when the site is built (a transform in .eleventy.js).
//
// The owner asked (2026-10-25) for internal links wherever a page's copy names another page's
// topic. The words themselves are never changed: the first mention of each topic on a page
// becomes a link, about one per WORDS_PER_LINK words of the page (between MIN_LINKS and MAX_LINKS)
// and at most MAX_PER_BLOCK in one paragraph, so links spread through the page. Only body paragraphs,
// list items and table/definition cells inside <main> are linked, section intros included. Never
// inside headings, buttons, bold run-in labels, existing links, heroes, CTA bands, forms, figures,
// coded diagrams, author bios, the Nextwebi module or any element marked data-no-autolink; never to
// the page itself or to a page this one already linked further up. Each link carries
// class="autolink" (base/typography.css: the words keep their colour over a thin orange underline).
//
// Add a page's topic phrases to TOPICS when the page is created: wording the copy really uses, specific
// enough that every match means that page. Longer phrases win over shorter ones that start at the same
// place, so a full name ("OWASP API Security Top 10") stays one link instead of two.

const S = '/services/', I = '/industries/', W = '/whitepapers/', N = '/insights/';
const TOPICS = [
  // Services
  [S + 'vapt-security-services/', 'vulnerability assessment and penetration testing', 'vulnerability assessments and penetration testing',
    'penetration testing and vulnerability assessments', 'penetration testing and vulnerability assessment', 'VAPT services', 'VAPT',
    'vulnerability assessments', 'vulnerability assessment', 'vulnerability scanning'],
  [S + 'penetration-testing/', 'penetration testing services', 'penetration testing', 'pen testing', 'penetration tests', 'penetration test',
    'pentest'],
  [S + 'web-application-security-testing/', 'web application security testing', 'web application security', 'web app security',
    'web application penetration testing', 'web applications', 'web application', 'OWASP Application Security Verification Standard',
    'OWASP Web Security Testing Guide'],
  [S + 'mobile-application-security-testing/', 'mobile application security testing', 'mobile application security', 'mobile app security',
    'mobile application penetration testing', 'mobile applications', 'mobile application', 'mobile apps', 'mobile app', 'Android and iOS',
    'iOS and Android', 'OWASP MASVS', 'OWASP Mobile Application Security Verification Standard',
    'OWASP Mobile Application Security Testing Guide', 'OWASP Mobile Application Security'],
  [S + 'api-security-testing/', 'API security testing', 'API penetration testing', 'API security', 'APIs', 'API testing', 'API endpoints',
    'OWASP API Security Top 10', 'OWASP API Top 10'],
  [S + 'cloud-security-services/', 'cloud security assessment', 'cloud security services', 'cloud security', 'cloud penetration testing',
    'cloud environments', 'cloud configurations', 'cloud infrastructure', 'cloud platforms', 'cloud workloads', 'cloud accounts',
    'cloud deployments', 'cloud resources', 'cloud assets', 'cloud misconfigurations', 'cloud-native', 'multi-cloud'],
  [S + 'network-security-testing/', 'network security testing', 'network penetration testing', 'network vulnerability assessment',
    'network security', 'network infrastructure', 'network segmentation', 'internal networks', 'internal network', 'external network',
    'network devices'],
  [S + 'security-architecture-review/', 'security architecture review', 'security architecture', 'architecture reviews', 'architecture review',
    'system architecture', 'threat modeling', 'threat modelling'],
  [S + 'devsecops-services/', 'DevSecOps', 'CI/CD pipelines', 'CI/CD pipeline', 'CI/CD', 'software development lifecycle'],
  [S + 'soc-as-a-service/', 'SOC as a Service', 'security operations center', 'security operations', 'managed SOC', 'SOC', 'SIEM',
    'security monitoring', 'continuous monitoring', 'threat detection'],
  [S + 'security-compliance/', 'security compliance', 'compliance assessments', 'compliance requirements', 'regulatory compliance',
    'regulatory requirements', 'ISO 27001', 'SOC 2 Type II', 'SOC 2', 'PCI DSS', 'HIPAA', 'GDPR', 'compliance'],
  [S + 'cybersecurity-consulting/', 'cybersecurity consulting', 'cyber security consulting', 'security consulting', 'security strategy',
    'security roadmap', 'security program', 'risk assessment'],
  [S + 'llm-security-testing/', 'LLM security testing', 'LLM penetration testing', 'LLM application security', 'jailbreak testing'],
  [S + 'ai-agent-security-testing/', 'AI agent security testing', 'AI agent security', 'agentic AI security', 'AI agent penetration testing', 'excessive agency'],
  [S + 'post-quantum-cryptography-security/', 'post-quantum cryptography', 'quantum-resistant cryptography', 'quantum-safe', 'quantum computers', 'harvest now, decrypt later'],
  [S + 'digital-identity-deepfake-security/', 'deepfake security', 'deepfake fraud', 'deepfakes', 'deepfake', 'synthetic identities', 'synthetic identity', 'voice cloning', 'identity verification'],
  [S + 'iot-ot-security/', 'IoT and OT security', 'IoT security', 'OT security', 'operational technology', 'industrial control systems', 'ICS security', 'SCADA', 'IoT penetration testing', 'firmware analysis'],
  ['/ai-security/', 'AI security testing', 'AI security', 'LLM security', 'AI agents', 'AI applications', 'large language models', 'LLMs',
    'LLM', 'prompt injection', 'OWASP LLM Top 10'],
  // Industries
  [I + 'banking-fintech/', 'fintech', 'banking', 'banks', 'payment systems'],
  [I + 'healthcare/', 'healthcare', 'patient data', 'health records'],
  [I + 'ecommerce/', 'ecommerce', 'e-commerce', 'online retailers', 'checkout'],
  [I + 'saas-technology/', 'SaaS', 'multi-tenant', 'multi-tenancy'],
  [I + 'manufacturing/', 'manufacturing', 'manufacturers'],
  [I + 'logistics/', 'logistics', 'supply chains'],
  [I + 'startups/', 'startups', 'startup'],
  [I + 'enterprise-it/', 'enterprise IT', 'enterprises', 'enterprise environments', 'enterprise networks', 'enterprise systems',
    'large organizations', 'large organisations'],
  ['/penetration-testing-company-bangalore/', 'Bangalore'],
  // Whitepapers
  [W + 'owasp-top-10-security-guide/', 'OWASP Top 10 Security Guide', 'OWASP Top 10', 'OWASP'],
  [W + 'incident-response-checklist/', 'incident response'],
  [W + 'identity-access-management-checklist/', 'identity and access management', 'access management', 'privileged access', 'IAM'],
  // Insights
  [N + 'common-api-security-vulnerabilities/', 'API security vulnerabilities', 'API vulnerabilities', 'broken object level authorization',
    'broken object-level authorization', 'BOLA'],
  [N + 'common-web-application-vulnerabilities/', 'web application vulnerabilities', 'SQL injection', 'cross-site scripting'],
  [N + 'common-mobile-app-vulnerabilities/', 'mobile app vulnerabilities', 'insecure data storage'],
  [N + 'common-cloud-security-risk-areas/', 'cloud security risks'],
  [N + 'common-vulnerabilities-vapt-finds/', 'common vulnerabilities'],
  [N + 'how-attackers-move-through-your-network/', 'lateral movement', 'move laterally'],
  [N + 'open-source-supply-chain-attacks/', 'supply chain attacks', 'supply-chain attacks', 'software supply chain',
    'open-source dependencies', 'third-party libraries'],
  [N + 'penetration-testing-attack-scenarios/', 'real-world attack scenarios', 'attack scenarios'],
  [N + 'architecture-level-security-risks/', 'architectural risks'],
  [N + 'security-compliance-framework-areas/', 'compliance frameworks'],
  [N + 'the-agents-are-working/', 'agentic AI', 'autonomous agents'],
  [N + 'threat-categories-soc-monitors/', 'ransomware', 'phishing'],
];
// Names that contain a topic phrase but mean something else: matched whole and left unlinked
const KEEP = ['Penetration Testing Execution Standard'];

const WORDS_PER_LINK = 150;
const MIN_LINKS = 3;
const MAX_LINKS = 10;
const MAX_PER_BLOCK = 1;
// Pages whose job is conversion or legal text get no extra links
const SKIP_PAGES = new Set(['/contact/', '/privacy/', '/terms/', '/thank-you/', '/404.html']);
// Text is linked only when its nearest block is one of these
const BLOCKS = new Set(['p', 'li', 'dd', 'td']);
const NO_TAGS = new Set(['a', 'button', 'label', 'option', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figcaption',
  'nav', 'footer', 'summary', 'dt', 'th', 'blockquote', 'sup', 'small', 'strong', 'b', 'form', 'dialog']);
const NO_CLASSES = new Set(['band', 'final', 'intake', 'inquiry', 'qq', 'actionbar', 'tstrip', 'backed', 'trustline',
  'console', 'board', 'xreport', 'xp', 'xp-box', 'aimap', 'ai-agent', 'ai-report', 'cover', 'rail', 'spec', 'tag',
  'xaud', 'vcheck', 'plate', 'story', 'surface', 'kicker', 'flow__label', 'mx', 'filterbar', 'faq-layout__aside', 'hub-head',
  'a-author', 'take', 'finding']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

const phraseUrl = new Map();
TOPICS.forEach(([url, ...phrases]) => phrases.forEach((p) => phraseUrl.set(p.toLowerCase(), url)));
KEEP.forEach((p) => phraseUrl.set(p.toLowerCase(), ''));
const alternation = [...phraseUrl.keys()]
  .sort((a, b) => b.length - a.length)
  .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'))
  .join('|');
const PHRASE = new RegExp('(?<![A-Za-z0-9_-])(' + alternation + ')(?![A-Za-z0-9_])', 'gi');
// Comments and raw blocks pass through whole; then tags; then text
const TOKEN = /<!--[\s\S]*?-->|<(script|style|svg|textarea|select|template|code|pre)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?([a-zA-Z][\w:-]*)\b[^>]*>|[^<]+/g;

function excluded(frame) {
  if (frame.noauto || NO_TAGS.has(frame.tag)) return true;
  return frame.cls.some((c) => NO_CLASSES.has(c) || c === 'hero' || c.endsWith('-hero') || c.endsWith('__hero') || c.endsWith('__tags'));
}

function linkMain(main, pageUrl) {
  const words = main.replace(TOKEN, (t, raw, tag) => (raw || tag || t.startsWith('<!--') ? ' ' : t)).split(/\s+/).filter(Boolean).length;
  const max = Math.min(MAX_LINKS, Math.max(MIN_LINKS, Math.round(words / WORDS_PER_LINK)));
  const stack = [];
  const used = new Set([pageUrl]);
  let count = 0;
  return main.replace(TOKEN, (token, raw, tagName) => {
    if (raw || token.startsWith('<!--')) return token;
    if (tagName) {
      const tag = tagName.toLowerCase();
      if (token.startsWith('</')) {
        const at = stack.map((f) => f.tag).lastIndexOf(tag);
        if (at !== -1) stack.length = at;
        return token;
      }
      if (VOID.has(tag) || token.endsWith('/>')) return token;
      // A page linked by the copy above (a card, a row, a name) is not linked again further down
      if (tag === 'a') { const href = /\shref="(\/[^"#?]*)/.exec(token); if (href) used.add(href[1]); }
      const cls = (/\sclass="([^"]*)"/.exec(token) || [, ''])[1].split(/\s+/).filter(Boolean);
      stack.push({ tag, cls, noauto: /\sdata-(no-autolink|lit)\b/.test(token), blocked: false, links: 0 });
      const top = stack[stack.length - 1];
      top.blocked = excluded(top) || (stack.length > 1 && stack[stack.length - 2].blocked);
      return token;
    }
    // Text
    if (count >= max || !stack.length || stack[stack.length - 1].blocked) return token;
    let block = null;
    for (let i = stack.length - 1; i >= 0; i--) if (BLOCKS.has(stack[i].tag)) { block = stack[i]; break; }
    if (!block) return token;
    return token.replace(PHRASE, (m) => {
      if (count >= max || block.links >= MAX_PER_BLOCK) return m;
      const url = phraseUrl.get(m.toLowerCase().replace(/\s+/g, ' '));
      if (!url || used.has(url)) return m;
      used.add(url);
      count++;
      block.links++;
      return '<a class="autolink" href="' + url + '">' + m + '</a>';
    });
  });
}

module.exports = function autolink(html, pageUrl) {
  if (!pageUrl || SKIP_PAGES.has(pageUrl)) return html;
  const start = html.indexOf('<main');
  const end = html.lastIndexOf('</main>');
  if (start === -1 || end === -1) return html;
  return html.slice(0, start) + linkMain(html.slice(start, end), pageUrl) + html.slice(end);
};
module.exports.TOPICS = TOPICS;
