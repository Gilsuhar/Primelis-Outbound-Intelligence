import type { OutputLanguage } from "@/lib/output-language";

type UiTextKey =
  | "language.selector"
  | "nav.sales"
  | "nav.admin"
  | "nav.Home"
  | "nav.Signal Playbook"
  | "nav.Account Research"
  | "nav.Create Outreach"
  | "nav.Build Sequence"
  | "nav.Reply to Prospect"
  | "nav.Ask Signal Brain"
  | "nav.Do Not Contact"
  | "nav.Knowledge Library"
  | "nav.Add Knowledge"
  | "nav.Review Queue"
  | "nav.Imported Signal Review"
  | "nav.Account Import"
  | "nav.Claim Details"
  | "shell.adminView"
  | "shell.salesView"
  | "home.eyebrow"
  | "home.title"
  | "home.description"
  | "home.openPlaybook"
  | "home.learnSignal.title"
  | "home.learnSignal.description"
  | "home.createOutreach.title"
  | "home.createOutreach.description"
  | "home.buildSequence.title"
  | "home.buildSequence.description"
  | "home.replyToProspect.title"
  | "home.replyToProspect.description"
  | "home.doNotContact.title"
  | "home.doNotContact.description"
  | "home.adminShortcuts"
  | "dnc.eyebrow"
  | "dnc.title"
  | "dnc.description"
  | "dnc.listTitle"
  | "dnc.listDescription"
  | "dnc.searchLabel"
  | "dnc.searchPlaceholder"
  | "dnc.emptyTitle"
  | "dnc.emptyDescription"
  | "dnc.domainMissing"
  | "dnc.status"
  | "dnc.product"
  | "dnc.country"
  | "dnc.owner"
  | "dnc.lastContact"
  | "dnc.reason"
  | "dnc.notSpecified"
  | "dnc.notRecorded"
  | "status.EXISTING_CUSTOMER"
  | "status.ACTIVE_OPPORTUNITY"
  | "status.OWNED_BY_ANOTHER_REP"
  | "status.RECENTLY_CONTACTED"
  | "status.PARTNER"
  | "status.DO_NOT_CONTACT"
  | "status.RESTRICTED_TERRITORY";

const english: Record<UiTextKey, string> = {
  "language.selector": "Language",
  "nav.sales": "Sales",
  "nav.admin": "Admin",
  "nav.Home": "Home",
  "nav.Signal Playbook": "Signal Playbook",
  "nav.Account Research": "Account Research",
  "nav.Create Outreach": "Create Outreach",
  "nav.Build Sequence": "Build Sequence",
  "nav.Reply to Prospect": "Reply to Prospect",
  "nav.Ask Signal Brain": "Ask Signal Brain",
  "nav.Do Not Contact": "Do Not Contact",
  "nav.Knowledge Library": "Knowledge Library",
  "nav.Add Knowledge": "Add Knowledge",
  "nav.Review Queue": "Review Queue",
  "nav.Imported Signal Review": "Imported Signal Review",
  "nav.Account Import": "Account Import",
  "nav.Claim Details": "Claim Details",
  "shell.adminView": "Admin view",
  "shell.salesView": "Sales view",
  "home.eyebrow": "Primelis Signal",
  "home.title": "Simple tools for sharper Signal selling.",
  "home.description":
    "A focused workspace for learning Signal, checking fit, and creating careful outbound messages for the US market.",
  "home.openPlaybook": "Open Signal Playbook",
  "home.learnSignal.title": "Learn Signal",
  "home.learnSignal.description": "Review ICP, personas, objections, and US-market guidance.",
  "home.createOutreach.title": "Create Outreach",
  "home.createOutreach.description":
    "Draft a concise email or LinkedIn message from approved Signal knowledge.",
  "home.buildSequence.title": "Build Sequence",
  "home.buildSequence.description": "Plan a short multi-step sequence with a clear angle.",
  "home.replyToProspect.title": "Reply to Prospect",
  "home.replyToProspect.description": "Answer a prospect message with source-backed guidance.",
  "home.doNotContact.title": "Check Do Not Contact",
  "home.doNotContact.description": "Search account suppression guidance before outreach.",
  "home.adminShortcuts": "Admin shortcuts",
  "dnc.eyebrow": "Sales safety",
  "dnc.title": "Do Not Contact check",
  "dnc.description":
    "Search the company or domain before outreach. If there is a match, do not send until it is reviewed.",
  "dnc.listTitle": "Suppression list",
  "dnc.listDescription":
    "Supported statuses: existing customer, active opportunity, owned by another rep, recently contacted, partner, do not contact, and restricted territory.",
  "dnc.searchLabel": "Company or domain search",
  "dnc.searchPlaceholder": "Search company or domain",
  "dnc.emptyTitle": "No suppression records yet",
  "dnc.emptyDescription":
    "No blocked accounts have been imported yet. Add real suppression data before using this as the final approval step.",
  "dnc.domainMissing": "Domain not provided",
  "dnc.status": "Status",
  "dnc.product": "Product",
  "dnc.country": "Country",
  "dnc.owner": "Owner",
  "dnc.lastContact": "Last contact",
  "dnc.reason": "Reason",
  "dnc.notSpecified": "Not specified",
  "dnc.notRecorded": "Not recorded",
  "status.EXISTING_CUSTOMER": "Existing customer",
  "status.ACTIVE_OPPORTUNITY": "Active opportunity",
  "status.OWNED_BY_ANOTHER_REP": "Owned by another rep",
  "status.RECENTLY_CONTACTED": "Recently contacted",
  "status.PARTNER": "Partner",
  "status.DO_NOT_CONTACT": "Do not contact",
  "status.RESTRICTED_TERRITORY": "Restricted territory",
};

const french: Record<UiTextKey, string> = {
  ...english,
  "language.selector": "Langue",
  "nav.sales": "Vente",
  "nav.admin": "Admin",
  "nav.Home": "Accueil",
  "nav.Signal Playbook": "Playbook Signal",
  "nav.Account Research": "Recherche compte",
  "nav.Create Outreach": "Créer un message",
  "nav.Build Sequence": "Créer une séquence",
  "nav.Reply to Prospect": "Répondre au prospect",
  "nav.Ask Signal Brain": "Demander à Signal Brain",
  "nav.Do Not Contact": "Ne pas contacter",
  "nav.Knowledge Library": "Bibliothèque",
  "nav.Add Knowledge": "Ajouter une connaissance",
  "nav.Review Queue": "File de revue",
  "nav.Imported Signal Review": "Revue Signal importée",
  "nav.Account Import": "Import comptes",
  "nav.Claim Details": "Détails du claim",
  "shell.adminView": "Vue admin",
  "shell.salesView": "Vue vente",
  "home.eyebrow": "Primelis Signal",
  "home.title": "Des outils simples pour vendre Signal plus clairement.",
  "home.description":
    "Un espace de travail pour apprendre Signal, qualifier les comptes et créer des messages outbound adaptés au marché US.",
  "home.openPlaybook": "Ouvrir le playbook Signal",
  "home.learnSignal.title": "Apprendre Signal",
  "home.learnSignal.description": "Revoir l'ICP, les personas, les objections et les repères US.",
  "home.createOutreach.title": "Créer un message",
  "home.createOutreach.description":
    "Rédiger un email ou un message LinkedIn à partir de connaissances approuvées.",
  "home.buildSequence.title": "Créer une séquence",
  "home.buildSequence.description": "Préparer une courte séquence avec un angle clair.",
  "home.replyToProspect.title": "Répondre au prospect",
  "home.replyToProspect.description":
    "Répondre à un message prospect avec une réponse sourcée.",
  "home.doNotContact.title": "Vérifier Ne pas contacter",
  "home.doNotContact.description": "Vérifier les comptes à exclure avant tout outreach.",
  "home.adminShortcuts": "Raccourcis admin",
  "dnc.eyebrow": "Sécurité commerciale",
  "dnc.title": "Vérification Ne pas contacter",
  "dnc.description":
    "Recherchez l'entreprise ou le domaine avant tout outreach. En cas de correspondance, n'envoyez rien avant revue.",
  "dnc.listTitle": "Liste de suppression",
  "dnc.listDescription":
    "Statuts pris en charge : client existant, opportunité active, géré par un autre commercial, contact récent, partenaire, ne pas contacter et territoire restreint.",
  "dnc.searchLabel": "Recherche entreprise ou domaine",
  "dnc.searchPlaceholder": "Rechercher une entreprise ou un domaine",
  "dnc.emptyTitle": "Aucun compte bloqué pour le moment",
  "dnc.emptyDescription":
    "Aucun compte bloqué n'a encore été importé. Ajoutez les vraies données de suppression avant d'utiliser cette étape comme validation finale.",
  "dnc.domainMissing": "Domaine non renseigné",
  "dnc.status": "Statut",
  "dnc.product": "Produit",
  "dnc.country": "Pays",
  "dnc.owner": "Responsable",
  "dnc.lastContact": "Dernier contact",
  "dnc.reason": "Raison",
  "dnc.notSpecified": "Non renseigné",
  "dnc.notRecorded": "Non enregistré",
  "status.EXISTING_CUSTOMER": "Client existant",
  "status.ACTIVE_OPPORTUNITY": "Opportunité active",
  "status.OWNED_BY_ANOTHER_REP": "Géré par un autre commercial",
  "status.RECENTLY_CONTACTED": "Contacté récemment",
  "status.PARTNER": "Partenaire",
  "status.DO_NOT_CONTACT": "Ne pas contacter",
  "status.RESTRICTED_TERRITORY": "Territoire restreint",
};

const portuguese: Record<UiTextKey, string> = {
  ...english,
  "language.selector": "Idioma",
  "nav.sales": "Vendas",
  "nav.admin": "Admin",
  "nav.Home": "Início",
  "nav.Signal Playbook": "Playbook Signal",
  "nav.Account Research": "Pesquisa de conta",
  "nav.Create Outreach": "Criar mensagem",
  "nav.Build Sequence": "Criar sequência",
  "nav.Reply to Prospect": "Responder prospect",
  "nav.Ask Signal Brain": "Perguntar ao Signal Brain",
  "nav.Do Not Contact": "Não contactar",
  "nav.Knowledge Library": "Biblioteca",
  "nav.Add Knowledge": "Adicionar conhecimento",
  "nav.Review Queue": "Fila de revisão",
  "nav.Imported Signal Review": "Revisão Signal importada",
  "nav.Account Import": "Importar contas",
  "nav.Claim Details": "Detalhes do claim",
  "shell.adminView": "Vista admin",
  "shell.salesView": "Vista vendas",
  "home.title": "Ferramentas simples para vender Signal melhor.",
  "home.description":
    "Um espaço focado para aprender Signal, qualificar contas e criar mensagens outbound para o mercado dos EUA.",
  "home.openPlaybook": "Abrir playbook Signal",
  "home.adminShortcuts": "Atalhos admin",
  "dnc.eyebrow": "Segurança comercial",
  "dnc.title": "Verificação Não contactar",
  "dnc.description":
    "Pesquise a empresa ou domínio antes do outreach. Se houver correspondência, não envie antes da revisão.",
  "dnc.listTitle": "Lista de supressão",
  "dnc.searchLabel": "Pesquisa de empresa ou domínio",
  "dnc.searchPlaceholder": "Pesquisar empresa ou domínio",
  "dnc.emptyTitle": "Nenhum registro de supressão ainda",
  "dnc.emptyDescription":
    "Nenhuma conta bloqueada foi importada ainda. Adicione dados reais antes de usar isto como validação final.",
};

function dictionaryFor(language: OutputLanguage) {
  if (language === "FRENCH") return french;
  if (language === "PORTUGUESE") return portuguese;
  return english;
}

export function translateUi(key: UiTextKey, language: OutputLanguage) {
  return dictionaryFor(language)[key] ?? english[key];
}

export function translateNavigationLabel(label: string, language: OutputLanguage) {
  return translateUi(`nav.${label}` as UiTextKey, language);
}
