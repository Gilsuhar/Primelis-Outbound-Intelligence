import type { OutputLanguage } from "@/lib/output-language";

export type UiTextKey =
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
  | "home.accountResearch.title"
  | "home.accountResearch.description"
  | "home.buildSequence.title"
  | "home.buildSequence.description"
  | "home.replyToProspect.title"
  | "home.replyToProspect.description"
  | "home.doNotContact.title"
  | "home.doNotContact.description"
  | "home.askSignalBrain.title"
  | "home.askSignalBrain.description"
  | "home.adminShortcuts"
  | "home.openTool"
  | "workflow.eyebrow"
  | "workflow.sourceBacked"
  | "workflow.approvedKnowledge"
  | "workflow.draftOnly"
  | "workflow.quickBrief"
  | "workflow.quickReplyBrief"
  | "workflow.quickQuestion"
  | "workflow.generatedMessage"
  | "workflow.generatedResponse"
  | "workflow.strategy"
  | "workflow.answer"
  | "workflow.guidance"
  | "workflow.subjectLines"
  | "workflow.basedOn"
  | "workflow.recommendedMessage"
  | "workflow.recommendedReply"
  | "workflow.fullEmail"
  | "workflow.shorterVersion"
  | "workflow.shorterAlternative"
  | "workflow.cta"
  | "workflow.angleAndSignals"
  | "workflow.sourcesAndSafety"
  | "workflow.advancedOptionalDetails"
  | "workflow.advancedOptionalContext"
  | "workflow.advancedAccountContext"
  | "workflow.generate"
  | "workflow.copy"
  | "workflow.copied"
  | "workflow.generateEmail"
  | "workflow.generateReply"
  | "workflow.buildSequence"
  | "workflow.askSignalBrain"
  | "workflow.drafting"
  | "workflow.building"
  | "workflow.answering"
  | "workflow.choose"
  | "workflow.otherManual"
  | "workflow.enterManually"
  | "workflow.company"
  | "workflow.website"
  | "workflow.firstNameOptional"
  | "workflow.firstName"
  | "workflow.buyerRole"
  | "workflow.fitIcp"
  | "workflow.industry"
  | "workflow.reasonForOutreach"
  | "workflow.tone"
  | "workflow.emailLength"
  | "workflow.length"
  | "workflow.channel"
  | "workflow.type"
  | "workflow.market"
  | "workflow.currentVendor"
  | "workflow.paidSearchContext"
  | "workflow.internalNotes"
  | "workflow.contextNotes"
  | "workflow.prospectMessage"
  | "workflow.steps"
  | "workflow.duration"
  | "workflow.useCaseStudy"
  | "workflow.create.title"
  | "workflow.create.description"
  | "workflow.create.empty"
  | "workflow.sequence.title"
  | "workflow.sequence.description"
  | "workflow.sequence.empty"
  | "workflow.reply.title"
  | "workflow.reply.description"
  | "workflow.reply.placeholder"
  | "workflow.reply.empty"
  | "workflow.brain.title"
  | "workflow.brain.description"
  | "workflow.brain.questionLabel"
  | "workflow.brain.answerMode"
  | "workflow.brain.empty"
  | "account.title"
  | "account.description"
  | "account.step1"
  | "account.step2"
  | "account.step3"
  | "account.step4"
  | "account.companyName"
  | "account.companyDomain"
  | "account.headquarters"
  | "account.markets"
  | "account.employeeContext"
  | "account.companyType"
  | "account.assess"
  | "playbook.eyebrow"
  | "playbook.title"
  | "playbook.description"
  | "playbook.learn.title"
  | "playbook.learn.description"
  | "playbook.learn.details"
  | "playbook.icp.title"
  | "playbook.icp.description"
  | "playbook.industries.title"
  | "playbook.personas.title"
  | "playbook.transition.title"
  | "playbook.qualify.title"
  | "playbook.work.title"
  | "playbook.objections.title"
  | "playbook.caseStudies.title"
  | "playbook.dnc.title"
  | "playbook.practice.title"
  | "playbook.progress.title"
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
  "home.accountResearch.title": "Account Research",
  "home.accountResearch.description": "Check fit, signals, and the next best workflow.",
  "home.buildSequence.title": "Build Sequence",
  "home.buildSequence.description": "Plan a short multi-step sequence with a clear angle.",
  "home.replyToProspect.title": "Reply to Prospect",
  "home.replyToProspect.description": "Answer a prospect message with source-backed guidance.",
  "home.doNotContact.title": "Check Do Not Contact",
  "home.doNotContact.description": "Search account suppression guidance before outreach.",
  "home.askSignalBrain.title": "Ask Signal Brain",
  "home.askSignalBrain.description": "Ask a specific question and get a safe recommendation.",
  "home.adminShortcuts": "Admin shortcuts",
  "home.openTool": "Open",
  "workflow.eyebrow": "Sales workflow",
  "workflow.sourceBacked": "Source-backed only",
  "workflow.approvedKnowledge": "Approved knowledge only",
  "workflow.draftOnly": "Draft only",
  "workflow.quickBrief": "Quick brief",
  "workflow.quickReplyBrief": "Quick reply brief",
  "workflow.quickQuestion": "Quick question",
  "workflow.generatedMessage": "Generated message",
  "workflow.generatedResponse": "Generated response",
  "workflow.strategy": "Strategy",
  "workflow.answer": "Answer",
  "workflow.guidance": "Guidance",
  "workflow.subjectLines": "Subject lines",
  "workflow.basedOn": "Based on",
  "workflow.recommendedMessage": "Recommended message",
  "workflow.recommendedReply": "Recommended reply",
  "workflow.fullEmail": "Full email",
  "workflow.shorterVersion": "Shorter version",
  "workflow.shorterAlternative": "Shorter alternative",
  "workflow.cta": "CTA",
  "workflow.angleAndSignals": "Angle and signals",
  "workflow.sourcesAndSafety": "Sources and safety",
  "workflow.advancedOptionalDetails": "Advanced optional details",
  "workflow.advancedOptionalContext": "Advanced optional context",
  "workflow.advancedAccountContext": "Advanced account context",
  "workflow.generate": "Generate",
  "workflow.copy": "Copy",
  "workflow.copied": "Copied",
  "workflow.generateEmail": "Generate email",
  "workflow.generateReply": "Generate reply",
  "workflow.buildSequence": "Build sequence",
  "workflow.askSignalBrain": "Ask Signal Brain",
  "workflow.drafting": "Drafting...",
  "workflow.building": "Building...",
  "workflow.answering": "Answering...",
  "workflow.choose": "Choose...",
  "workflow.otherManual": "Other / enter manually",
  "workflow.enterManually": "Enter manually",
  "workflow.company": "Company",
  "workflow.website": "Website",
  "workflow.firstNameOptional": "First name (optional)",
  "workflow.firstName": "First name",
  "workflow.buyerRole": "Buyer role",
  "workflow.fitIcp": "Fit / ICP",
  "workflow.industry": "Industry",
  "workflow.reasonForOutreach": "Reason for outreach",
  "workflow.tone": "Tone",
  "workflow.emailLength": "Email length",
  "workflow.length": "Length",
  "workflow.channel": "Channel",
  "workflow.type": "Type",
  "workflow.market": "Market",
  "workflow.currentVendor": "Current vendor/tool",
  "workflow.paidSearchContext": "Paid-search context",
  "workflow.internalNotes": "Internal notes",
  "workflow.contextNotes": "Context notes",
  "workflow.prospectMessage": "Prospect message",
  "workflow.steps": "Steps",
  "workflow.duration": "Duration",
  "workflow.useCaseStudy": "Use relevant case study if available",
  "workflow.create.title": "Create Outreach",
  "workflow.create.description": "Pick the account basics, generate a short first draft, then refine.",
  "workflow.create.empty": "Generate a draft, then edit the intro, pain point, solution, and CTA before sending.",
  "workflow.sequence.title": "Build Sequence",
  "workflow.sequence.description":
    "Build a short sequence from the same quick brief, without starting from a blank page.",
  "workflow.sequence.empty": "Build a sequence, then edit each subject, body, and CTA before copying.",
  "workflow.reply.title": "Reply to Prospect",
  "workflow.reply.description":
    "Paste the reply, choose the buyer role and tone, then generate a careful response.",
  "workflow.reply.placeholder": "Paste the prospect's message here.",
  "workflow.reply.empty": "Paste the prospect message and generate a reply you can edit and send.",
  "workflow.brain.title": "Ask Signal Brain",
  "workflow.brain.description":
    "Ask one specific question and get a safe recommendation from approved Signal context.",
  "workflow.brain.questionLabel": "What do you want to know?",
  "workflow.brain.answerMode": "Answer mode",
  "workflow.brain.empty": "Choose a question, add context only if needed, and the answer will appear here.",
  "account.title": "Account Research",
  "account.description":
    "Fill only what you know, then get a fit decision, recommended angle, and next action.",
  "account.step1": "Step 1: Account basics",
  "account.step2": "Step 2: Search and organization signals",
  "account.step3": "Step 3: Suppression check",
  "account.step4": "Step 4: Qualification result",
  "account.companyName": "Company name",
  "account.companyDomain": "Company domain",
  "account.headquarters": "Headquarters or main market",
  "account.markets": "Markets or countries",
  "account.employeeContext": "Employee context",
  "account.companyType": "Company type",
  "account.assess": "Assess account",
  "playbook.eyebrow": "Signal Playbook",
  "playbook.title": "Learn the product. Pick the right accounts. Keep the message sharp.",
  "playbook.description":
    "A concise internal guide for experienced Primelis sellers learning Signal in the US market. Use it to qualify accounts, choose the right persona, and stay careful with evidence.",
  "playbook.learn.title": "What Signal helps teams decide",
  "playbook.learn.description":
    "Use approved product truth for factual claims. Treat guidance as internal unless it is explicitly approved for external wording.",
  "playbook.learn.details": "Three scenarios and safety limits",
  "playbook.icp.title": "Approved Signal ICP v1",
  "playbook.icp.description":
    "A strong candidate usually has most of these signals. Revenue or company size alone never qualifies an account.",
  "playbook.industries.title": "Prioritize proven segments first",
  "playbook.personas.title": "Target ownership, not title seniority alone",
  "playbook.transition.title": "Practical shifts for US outreach",
  "playbook.qualify.title": "Keep the fit decision simple",
  "playbook.work.title": "One operating flow",
  "playbook.objections.title": "Respond without unsupported claims",
  "playbook.caseStudies.title": "Use customer evidence carefully",
  "playbook.dnc.title": "Check suppression before outreach",
  "playbook.practice.title": "Five quick non-AI scenarios",
  "playbook.progress.title": "Lightweight readiness",
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
  "home.accountResearch.title": "Recherche compte",
  "home.accountResearch.description": "Vérifier le fit, les signaux et la meilleure suite.",
  "home.buildSequence.title": "Créer une séquence",
  "home.buildSequence.description": "Préparer une courte séquence avec un angle clair.",
  "home.replyToProspect.title": "Répondre au prospect",
  "home.replyToProspect.description":
    "Répondre à un message prospect avec une réponse sourcée.",
  "home.doNotContact.title": "Vérifier Ne pas contacter",
  "home.doNotContact.description": "Vérifier les comptes à exclure avant tout outreach.",
  "home.askSignalBrain.title": "Demander à Signal Brain",
  "home.askSignalBrain.description": "Poser une question précise et obtenir une recommandation sûre.",
  "home.adminShortcuts": "Raccourcis admin",
  "home.openTool": "Ouvrir",
  "workflow.eyebrow": "Workflow vente",
  "workflow.sourceBacked": "Sourcé uniquement",
  "workflow.approvedKnowledge": "Connaissance approuvée uniquement",
  "workflow.draftOnly": "Brouillon uniquement",
  "workflow.quickBrief": "Brief rapide",
  "workflow.quickReplyBrief": "Brief de réponse",
  "workflow.quickQuestion": "Question rapide",
  "workflow.generatedMessage": "Message généré",
  "workflow.generatedResponse": "Réponse générée",
  "workflow.strategy": "Stratégie",
  "workflow.answer": "Réponse",
  "workflow.guidance": "Guidance",
  "workflow.subjectLines": "Objets",
  "workflow.basedOn": "Basé sur",
  "workflow.recommendedMessage": "Message recommandé",
  "workflow.recommendedReply": "Réponse recommandée",
  "workflow.fullEmail": "Email complet",
  "workflow.shorterVersion": "Version courte",
  "workflow.shorterAlternative": "Alternative courte",
  "workflow.cta": "CTA",
  "workflow.angleAndSignals": "Angle et signaux",
  "workflow.sourcesAndSafety": "Sources et sécurité",
  "workflow.advancedOptionalDetails": "Détails optionnels avancés",
  "workflow.advancedOptionalContext": "Contexte optionnel avancé",
  "workflow.advancedAccountContext": "Contexte compte avancé",
  "workflow.generate": "Générer",
  "workflow.copy": "Copier",
  "workflow.copied": "Copié",
  "workflow.generateEmail": "Générer l'email",
  "workflow.generateReply": "Générer la réponse",
  "workflow.buildSequence": "Créer la séquence",
  "workflow.askSignalBrain": "Demander à Signal Brain",
  "workflow.drafting": "Rédaction...",
  "workflow.building": "Création...",
  "workflow.answering": "Réponse...",
  "workflow.choose": "Choisir...",
  "workflow.otherManual": "Autre / saisir manuellement",
  "workflow.enterManually": "Saisir manuellement",
  "workflow.company": "Entreprise",
  "workflow.website": "Site web",
  "workflow.firstNameOptional": "Prénom (optionnel)",
  "workflow.firstName": "Prénom",
  "workflow.buyerRole": "Rôle acheteur",
  "workflow.fitIcp": "Fit / ICP",
  "workflow.industry": "Industrie",
  "workflow.reasonForOutreach": "Raison du contact",
  "workflow.tone": "Ton",
  "workflow.emailLength": "Longueur email",
  "workflow.length": "Longueur",
  "workflow.channel": "Canal",
  "workflow.type": "Type",
  "workflow.market": "Marché",
  "workflow.currentVendor": "Outil actuel",
  "workflow.paidSearchContext": "Contexte paid search",
  "workflow.internalNotes": "Notes internes",
  "workflow.contextNotes": "Notes de contexte",
  "workflow.prospectMessage": "Message prospect",
  "workflow.steps": "Étapes",
  "workflow.duration": "Durée",
  "workflow.useCaseStudy": "Utiliser une étude de cas pertinente si disponible",
  "workflow.create.title": "Créer un message",
  "workflow.create.description": "Choisissez les bases du compte, générez un premier draft court, puis ajustez.",
  "workflow.create.empty": "Générez un draft, puis modifiez l'intro, le pain point, la solution et le CTA.",
  "workflow.sequence.title": "Créer une séquence",
  "workflow.sequence.description": "Créez une courte séquence depuis le même brief, sans repartir de zéro.",
  "workflow.sequence.empty": "Créez une séquence, puis modifiez chaque objet, corps et CTA.",
  "workflow.reply.title": "Répondre au prospect",
  "workflow.reply.description": "Collez le message, choisissez le rôle et le ton, puis générez une réponse.",
  "workflow.reply.placeholder": "Collez ici le message du prospect.",
  "workflow.reply.empty": "Collez le message du prospect et générez une réponse modifiable.",
  "workflow.brain.title": "Demander à Signal Brain",
  "workflow.brain.description": "Posez une question précise et obtenez une recommandation sûre.",
  "workflow.brain.questionLabel": "Que voulez-vous savoir ?",
  "workflow.brain.answerMode": "Mode de réponse",
  "workflow.brain.empty": "Choisissez une question, ajoutez du contexte seulement si besoin, puis la réponse apparaîtra ici.",
  "account.title": "Recherche compte",
  "account.description": "Renseignez uniquement ce que vous savez, puis obtenez le fit, l'angle et l'action suivante.",
  "account.step1": "Étape 1 : bases du compte",
  "account.step2": "Étape 2 : signaux search et organisation",
  "account.step3": "Étape 3 : suppression",
  "account.step4": "Étape 4 : résultat de qualification",
  "account.companyName": "Nom de l'entreprise",
  "account.companyDomain": "Domaine",
  "account.headquarters": "Siège ou marché principal",
  "account.markets": "Marchés ou pays",
  "account.employeeContext": "Contexte effectifs",
  "account.companyType": "Type d'entreprise",
  "account.assess": "Qualifier le compte",
  "playbook.eyebrow": "Playbook Signal",
  "playbook.title": "Comprendre le produit. Choisir les bons comptes. Garder un message clair.",
  "playbook.description": "Guide interne concis pour apprendre Signal sur le marché US, qualifier les comptes et rester prudent avec les preuves.",
  "playbook.learn.title": "Ce que Signal aide à décider",
  "playbook.learn.description": "Utilisez les vérités produit approuvées pour les claims factuels.",
  "playbook.learn.details": "Trois scénarios et limites de sécurité",
  "playbook.icp.title": "ICP Signal approuvé v1",
  "playbook.icp.description": "Un bon compte possède généralement plusieurs signaux. La taille seule ne qualifie pas.",
  "playbook.industries.title": "Prioriser les segments prouvés",
  "playbook.personas.title": "Cibler l'ownership, pas seulement le titre",
  "playbook.transition.title": "Ajustements pratiques pour le marché US",
  "playbook.qualify.title": "Garder la qualification simple",
  "playbook.work.title": "Un flux de travail simple",
  "playbook.objections.title": "Répondre sans claims non supportés",
  "playbook.caseStudies.title": "Utiliser les preuves clients prudemment",
  "playbook.dnc.title": "Vérifier la suppression avant contact",
  "playbook.practice.title": "Cinq scénarios rapides sans IA",
  "playbook.progress.title": "Readiness légère",
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
  "home.accountResearch.title": "Pesquisa de conta",
  "home.accountResearch.description": "Verificar fit, sinais e próxima ação.",
  "home.askSignalBrain.title": "Perguntar ao Signal Brain",
  "home.askSignalBrain.description": "Fazer uma pergunta específica e receber recomendação segura.",
  "home.adminShortcuts": "Atalhos admin",
  "home.openTool": "Abrir",
  "workflow.eyebrow": "Fluxo de vendas",
  "workflow.sourceBacked": "Apenas com fontes",
  "workflow.approvedKnowledge": "Apenas conhecimento aprovado",
  "workflow.draftOnly": "Apenas rascunho",
  "workflow.quickBrief": "Brief rápido",
  "workflow.quickReplyBrief": "Brief de resposta",
  "workflow.quickQuestion": "Pergunta rápida",
  "workflow.generatedMessage": "Mensagem gerada",
  "workflow.generatedResponse": "Resposta gerada",
  "workflow.strategy": "Estratégia",
  "workflow.answer": "Resposta",
  "workflow.guidance": "Orientação",
  "workflow.subjectLines": "Assuntos",
  "workflow.basedOn": "Baseado em",
  "workflow.recommendedMessage": "Mensagem recomendada",
  "workflow.recommendedReply": "Resposta recomendada",
  "workflow.fullEmail": "Email completo",
  "workflow.shorterVersion": "Versão curta",
  "workflow.shorterAlternative": "Alternativa curta",
  "workflow.cta": "CTA",
  "workflow.angleAndSignals": "Ângulo e sinais",
  "workflow.sourcesAndSafety": "Fontes e segurança",
  "workflow.advancedOptionalDetails": "Detalhes opcionais avançados",
  "workflow.advancedOptionalContext": "Contexto opcional avançado",
  "workflow.advancedAccountContext": "Contexto avançado da conta",
  "workflow.generate": "Gerar",
  "workflow.copy": "Copiar",
  "workflow.copied": "Copiado",
  "workflow.generateEmail": "Gerar email",
  "workflow.generateReply": "Gerar resposta",
  "workflow.buildSequence": "Criar sequência",
  "workflow.askSignalBrain": "Perguntar ao Signal Brain",
  "workflow.drafting": "Gerando...",
  "workflow.building": "Criando...",
  "workflow.answering": "Respondendo...",
  "workflow.choose": "Escolher...",
  "workflow.otherManual": "Outro / inserir manualmente",
  "workflow.enterManually": "Inserir manualmente",
  "workflow.company": "Empresa",
  "workflow.website": "Site",
  "workflow.firstNameOptional": "Nome (opcional)",
  "workflow.firstName": "Nome",
  "workflow.buyerRole": "Função do comprador",
  "workflow.fitIcp": "Fit / ICP",
  "workflow.industry": "Indústria",
  "workflow.reasonForOutreach": "Motivo do contato",
  "workflow.tone": "Tom",
  "workflow.emailLength": "Tamanho do email",
  "workflow.length": "Tamanho",
  "workflow.channel": "Canal",
  "workflow.type": "Tipo",
  "workflow.market": "Mercado",
  "workflow.currentVendor": "Ferramenta atual",
  "workflow.paidSearchContext": "Contexto de paid search",
  "workflow.internalNotes": "Notas internas",
  "workflow.contextNotes": "Notas de contexto",
  "workflow.prospectMessage": "Mensagem do prospect",
  "workflow.steps": "Etapas",
  "workflow.duration": "Duração",
  "workflow.useCaseStudy": "Usar case relevante se disponível",
  "workflow.create.title": "Criar mensagem",
  "workflow.create.description": "Escolha os dados básicos, gere um primeiro rascunho curto e refine.",
  "workflow.create.empty": "Gere um rascunho e edite intro, dor, solução e CTA antes de enviar.",
  "workflow.sequence.title": "Criar sequência",
  "workflow.sequence.description": "Crie uma sequência curta do mesmo brief, sem começar do zero.",
  "workflow.sequence.empty": "Crie uma sequência e edite assunto, corpo e CTA antes de copiar.",
  "workflow.reply.title": "Responder prospect",
  "workflow.reply.description": "Cole a mensagem, escolha função e tom, depois gere uma resposta cuidadosa.",
  "workflow.reply.placeholder": "Cole aqui a mensagem do prospect.",
  "workflow.reply.empty": "Cole a mensagem do prospect e gere uma resposta editável.",
  "workflow.brain.title": "Perguntar ao Signal Brain",
  "workflow.brain.description": "Faça uma pergunta específica e receba uma recomendação segura.",
  "workflow.brain.questionLabel": "O que você quer saber?",
  "workflow.brain.answerMode": "Modo de resposta",
  "workflow.brain.empty": "Escolha uma pergunta, adicione contexto só se necessário, e a resposta aparecerá aqui.",
  "account.title": "Pesquisa de conta",
  "account.description": "Preencha só o que sabe e receba fit, ângulo e próxima ação.",
  "account.step1": "Etapa 1: dados da conta",
  "account.step2": "Etapa 2: sinais de search e organização",
  "account.step3": "Etapa 3: supressão",
  "account.step4": "Etapa 4: qualificação",
  "account.companyName": "Nome da empresa",
  "account.companyDomain": "Domínio",
  "account.headquarters": "Sede ou mercado principal",
  "account.markets": "Mercados ou países",
  "account.employeeContext": "Contexto de funcionários",
  "account.companyType": "Tipo de empresa",
  "account.assess": "Avaliar conta",
  "playbook.eyebrow": "Playbook Signal",
  "playbook.title": "Aprenda o produto. Escolha as contas certas. Mantenha a mensagem clara.",
  "playbook.description": "Guia interno conciso para aprender Signal no mercado dos EUA, qualificar contas e usar evidências com cuidado.",
  "playbook.learn.title": "O que Signal ajuda as equipes a decidir",
  "playbook.learn.description": "Use verdades de produto aprovadas para afirmações factuais.",
  "playbook.learn.details": "Três cenários e limites de segurança",
  "playbook.icp.title": "ICP Signal aprovado v1",
  "playbook.icp.description": "Uma boa conta normalmente tem vários sinais. Tamanho sozinho não qualifica.",
  "playbook.industries.title": "Priorizar segmentos comprovados",
  "playbook.personas.title": "Mirar ownership, não só senioridade",
  "playbook.transition.title": "Ajustes práticos para outreach nos EUA",
  "playbook.qualify.title": "Manter a decisão de fit simples",
  "playbook.work.title": "Um fluxo operacional",
  "playbook.objections.title": "Responder sem claims sem suporte",
  "playbook.caseStudies.title": "Usar evidência de clientes com cuidado",
  "playbook.dnc.title": "Verificar supressão antes do contato",
  "playbook.practice.title": "Cinco cenários rápidos sem IA",
  "playbook.progress.title": "Readiness leve",
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
