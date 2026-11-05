'use strict';

(function () {
  // ---------- Référentiels ----------
  const STORAGE_KEY = 'maintenance-tickets-v1';
  const USER_KEY = 'maintenance-utilisateur';

  const STATUTS = [
    ['ouvert', 'Ouvert'],
    ['en_cours', 'En cours'],
    ['en_attente', 'En attente'],
    ['resolu', 'Résolu'],
    ['ferme', 'Fermé'],
  ];
  const PRIORITES = [
    ['basse', 'Basse'],
    ['normale', 'Normale'],
    ['haute', 'Haute'],
    ['urgente', 'Urgente'],
  ];
  const CATEGORIES = [
    'Électricité', 'Plomberie', 'Chauffage / climatisation', 'Informatique',
    'Bâtiment', 'Nettoyage', 'Sécurité', 'Autre',
  ];
  const ROLES = [['technicien', 'Technicien'], ['demandeur', 'Demandeur']];
  const PRIO_RANG = { basse: 0, normale: 1, haute: 2, urgente: 3 };
  const STATUTS_CLOS = ['resolu', 'ferme'];

  const libelle = (liste, cle) => (liste.find((x) => x[0] === cle) || [cle, cle])[1];

  const app = document.getElementById('app');
  const formatDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  const fdate = (iso) => formatDate.format(new Date(iso));
  const maintenant = () => new Date().toISOString();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ---------- Stockage (navigateur) ----------
  function charger() {
    try {
      const brut = localStorage.getItem(STORAGE_KEY);
      if (brut) {
        const d = JSON.parse(brut);
        if (d && Array.isArray(d.tickets)) return { seq: Number(d.seq) || d.tickets.length, tickets: d.tickets };
      }
    } catch (e) { /* stockage indisponible : on démarre vide */ }
    return { seq: 0, tickets: [] };
  }

  let donnees = charger();

  function enregistrer() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(donnees));
      return true;
    } catch (e) {
      notifier("Impossible d'enregistrer dans ce navigateur. Pensez à exporter vos tickets.");
      return false;
    }
  }

  function utilisateur() {
    try { return localStorage.getItem(USER_KEY) || ''; } catch (e) { return ''; }
  }
  function memoriserUtilisateur(nom) {
    try { localStorage.setItem(USER_KEY, nom); } catch (e) { /* ignoré */ }
  }

  // ---------- Modèle ----------
  function prochainNumero() {
    donnees.seq += 1;
    return 'MT-' + String(donnees.seq).padStart(4, '0');
  }

  const trouverTicket = (numero) => donnees.tickets.find((t) => t.numero === numero);

  function ajouterEvenement(ticket, ev) {
    ev.date = ev.date || maintenant();
    ticket.evenements.push(ev);
    ticket.majLe = ev.date;
  }

  function creerTicket(champs, date) {
    const d = date || maintenant();
    const t = {
      numero: prochainNumero(),
      titre: champs.titre,
      description: champs.description,
      categorie: champs.categorie,
      priorite: champs.priorite,
      lieu: champs.lieu || '',
      demandeur: champs.demandeur,
      email: champs.email || '',
      technicien: '',
      statut: 'ouvert',
      creeLe: d,
      majLe: d,
      evenements: [],
    };
    ajouterEvenement(t, { type: 'creation', auteur: champs.demandeur, role: 'demandeur', date: d });
    donnees.tickets.push(t);
    return t;
  }

  const nbReponses = (t) => t.evenements.filter((e) => e.type === 'reponse').length;

  // ---------- Petits composants ----------
  const badgeStatut = (s) => `<span class="badge statut-${esc(s)}">${esc(libelle(STATUTS, s))}</span>`;
  const badgePrio = (p) => `<span class="badge prio-${esc(p)}">${esc(libelle(PRIORITES, p))}</span>`;
  const options = (liste, sel) => liste
    .map(([k, v]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(v)}</option>`)
    .join('');

  let minuterieToast;
  function notifier(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // ---------- Vue : liste ----------
  const filtres = { q: '', statut: 'actifs', priorite: '', tri: 'maj' };

  function vueListe() {
    const compteurs = {};
    STATUTS.forEach(([k]) => { compteurs[k] = 0; });
    donnees.tickets.forEach((t) => { compteurs[t.statut] = (compteurs[t.statut] || 0) + 1; });

    app.innerHTML = `
      <section class="page-head">
        <div>
          <h1>Tickets de maintenance</h1>
          <p class="muted">${donnees.tickets.length} ticket(s) au total</p>
        </div>
      </section>

      <section class="stats" aria-label="Filtrer par statut">
        ${STATUTS.map(([k, v]) => `
          <button type="button" class="stat${filtres.statut === k ? ' active' : ''}" data-statut="${k}" aria-pressed="${filtres.statut === k}">
            <span class="stat-n">${compteurs[k]}</span>
            <span class="stat-l">${v}</span>
          </button>`).join('')}
      </section>

      <section class="toolbar">
        <input type="search" id="f-q" placeholder="Rechercher : n°, titre, lieu, demandeur…" aria-label="Rechercher" value="${esc(filtres.q)}">
        <select id="f-statut" aria-label="Statut">
          <option value="actifs">Tickets actifs</option>
          <option value="">Tous les statuts</option>
          ${options(STATUTS)}
        </select>
        <select id="f-priorite" aria-label="Priorité">
          <option value="">Toutes priorités</option>
          ${options(PRIORITES)}
        </select>
        <select id="f-tri" aria-label="Trier">
          <option value="maj">Dernière activité</option>
          <option value="creation">Date de création</option>
          <option value="priorite">Priorité</option>
        </select>
      </section>

      <div id="liste"></div>`;

    document.getElementById('f-statut').value = filtres.statut;
    document.getElementById('f-priorite').value = filtres.priorite;
    document.getElementById('f-tri').value = filtres.tri;

    document.getElementById('f-q').addEventListener('input', (e) => { filtres.q = e.target.value; afficherLignes(); });
    ['statut', 'priorite', 'tri'].forEach((cle) => {
      document.getElementById('f-' + cle).addEventListener('change', (e) => {
        filtres[cle] = e.target.value;
        if (cle === 'statut') majCompteursActifs(); else afficherLignes();
      });
    });

    app.querySelectorAll('.stat').forEach((b) => b.addEventListener('click', () => {
      const s = b.dataset.statut;
      filtres.statut = filtres.statut === s ? 'actifs' : s;
      document.getElementById('f-statut').value = filtres.statut;
      majCompteursActifs();
    }));

    document.getElementById('liste').addEventListener('click', (e) => {
      const ligne = e.target.closest('tr[data-href]');
      if (ligne && !e.target.closest('a')) location.hash = ligne.dataset.href;
    });

    afficherLignes();
  }

  function majCompteursActifs() {
    app.querySelectorAll('.stat').forEach((b) => {
      const actif = b.dataset.statut === filtres.statut;
      b.classList.toggle('active', actif);
      b.setAttribute('aria-pressed', String(actif));
    });
    afficherLignes();
  }

  function ticketsFiltres() {
    const q = filtres.q.trim().toLowerCase();
    const liste = donnees.tickets.filter((t) => {
      if (filtres.statut === 'actifs' && STATUTS_CLOS.includes(t.statut)) return false;
      if (filtres.statut && filtres.statut !== 'actifs' && t.statut !== filtres.statut) return false;
      if (filtres.priorite && t.priorite !== filtres.priorite) return false;
      if (q) {
        const texte = [t.numero, t.titre, t.lieu, t.demandeur, t.technicien, t.categorie, t.description].join(' ').toLowerCase();
        if (!texte.includes(q)) return false;
      }
      return true;
    });
    const parDate = (cle) => (a, b) => (b[cle] || '').localeCompare(a[cle] || '');
    if (filtres.tri === 'creation') liste.sort(parDate('creeLe'));
    else if (filtres.tri === 'priorite') liste.sort((a, b) => (PRIO_RANG[b.priorite] - PRIO_RANG[a.priorite]) || parDate('majLe')(a, b));
    else liste.sort(parDate('majLe'));
    return liste;
  }

  function afficherLignes() {
    const zone = document.getElementById('liste');
    if (!zone) return;

    if (donnees.tickets.length === 0) {
      zone.innerHTML = `
        <div class="card empty">
          <h2>Aucun ticket pour le moment</h2>
          <p>Créez votre premier ticket, ou chargez quelques exemples pour découvrir l'outil.</p>
          <div class="actions">
            <a class="btn btn-primary" href="#/nouveau">Créer un ticket</a>
            <button type="button" class="btn" id="btn-exemples">Charger des exemples</button>
          </div>
        </div>`;
      document.getElementById('btn-exemples').addEventListener('click', chargerExemples);
      return;
    }

    const liste = ticketsFiltres();
    if (liste.length === 0) {
      zone.innerHTML = '<div class="card empty"><p>Aucun ticket ne correspond à ces filtres.</p></div>';
      return;
    }

    zone.innerHTML = `
      <div class="table-wrap">
        <table class="tickets">
          <thead><tr>
            <th>N°</th><th>Ticket</th><th>Priorité</th><th>Statut</th><th>Technicien</th><th>Activité</th>
          </tr></thead>
          <tbody>
            ${liste.map((t) => {
              const lien = '#/ticket/' + encodeURIComponent(t.numero);
              const n = nbReponses(t);
              const sous = [t.categorie, t.lieu, n ? `${n} réponse${n > 1 ? 's' : ''}` : 'Sans réponse'].filter(Boolean).map(esc).join(' · ');
              return `
                <tr data-href="${lien}">
                  <td data-label="N°" class="nowrap mono"><a href="${lien}">${esc(t.numero)}</a></td>
                  <td data-label="Ticket" class="td-titre"><div class="t-titre">${esc(t.titre)}</div><div class="muted small">${sous}</div></td>
                  <td data-label="Priorité">${badgePrio(t.priorite)}</td>
                  <td data-label="Statut">${badgeStatut(t.statut)}</td>
                  <td data-label="Technicien">${t.technicien ? esc(t.technicien) : '<span class="muted">Non assigné</span>'}</td>
                  <td data-label="Activité" class="nowrap small muted">${esc(fdate(t.majLe))}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ---------- Vue : nouveau ticket ----------
  function vueNouveau() {
    app.innerHTML = `
      <a class="back" href="#/">← Tous les tickets</a>
      <section class="page-head"><h1>Nouveau ticket de maintenance</h1></section>
      <form id="form-nouveau" class="card form form-new" novalidate>
        <label>Titre <span class="req">*</span>
          <input name="titre" required maxlength="140" placeholder="Ex. : Fuite d'eau sous l'évier de la salle de pause">
        </label>
        <div class="row3">
          <label>Catégorie
            <select name="categorie">${CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
          </label>
          <label>Priorité
            <select name="priorite">${options(PRIORITES, 'normale')}</select>
          </label>
          <label>Lieu / équipement
            <input name="lieu" maxlength="120" placeholder="Bât. A, 2e étage">
          </label>
        </div>
        <label>Description du problème <span class="req">*</span>
          <textarea name="description" rows="6" required placeholder="Que se passe-t-il ? Depuis quand ? Qu'avez-vous déjà essayé ?"></textarea>
        </label>
        <div class="row2">
          <label>Votre nom <span class="req">*</span>
            <input name="demandeur" required maxlength="80" value="${esc(utilisateur())}" autocomplete="name">
          </label>
          <label>Email <span class="hint">(facultatif)</span>
            <input name="email" type="email" maxlength="120" autocomplete="email" placeholder="prenom.nom@exemple.fr">
          </label>
        </div>
        <div class="form-foot">
          <span class="muted small"><span class="req">*</span> champs obligatoires</span>
          <button class="btn btn-primary" type="submit">Créer le ticket</button>
        </div>
      </form>`;

    const form = document.getElementById('form-nouveau');
    form.querySelector('[name="titre"]').focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!champsValides(form)) return;
      const f = new FormData(form);
      const val = (k) => String(f.get(k) || '').trim();
      const t = creerTicket({
        titre: val('titre'),
        description: val('description'),
        categorie: val('categorie'),
        priorite: val('priorite'),
        lieu: val('lieu'),
        demandeur: val('demandeur'),
        email: val('email'),
      });
      memoriserUtilisateur(t.demandeur);
      enregistrer();
      notifier(`Ticket ${t.numero} créé`);
      location.hash = '#/ticket/' + encodeURIComponent(t.numero);
    });
  }

  // Refuse les champs obligatoires remplis uniquement d'espaces.
  function champsValides(form) {
    for (const el of form.querySelectorAll('[required]')) {
      if (!el.value.trim()) el.value = '';
    }
    return form.reportValidity();
  }

  // ---------- Vue : détail d'un ticket ----------
  function rendreEvenement(ev) {
    const qui = `<b>${esc(ev.auteur || 'Quelqu’un')}</b>`;
    const quand = `<time class="small">${esc(fdate(ev.date))}</time>`;
    switch (ev.type) {
      case 'creation':
        return `<li class="ev-sys">${qui} a créé le ticket · ${quand}</li>`;
      case 'statut':
        return `<li class="ev-sys">${qui} a changé le statut : ${badgeStatut(ev.de)} → ${badgeStatut(ev.a)} · ${quand}</li>`;
      case 'priorite':
        return `<li class="ev-sys">${qui} a changé la priorité : ${badgePrio(ev.de)} → ${badgePrio(ev.a)} · ${quand}</li>`;
      case 'assignation':
        return ev.a
          ? `<li class="ev-sys">${qui} a assigné le ticket à <b>${esc(ev.a)}</b> · ${quand}</li>`
          : `<li class="ev-sys">${qui} a retiré l'assignation · ${quand}</li>`;
      case 'reponse':
        return `
          <li class="ev-msg ${esc(ev.role)}">
            <header>
              <span><b>${esc(ev.auteur)}</b><span class="role role-${esc(ev.role)}">${esc(libelle(ROLES, ev.role))}</span></span>
              ${quand}
            </header>
            <p class="pre">${esc(ev.texte)}</p>
          </li>`;
      default:
        return '';
    }
  }

  function vueDetail(numero) {
    const t = trouverTicket(numero);
    if (!t) {
      app.innerHTML = `
        <div class="card empty">
          <h2>Ticket introuvable</h2>
          <p>Le ticket ${esc(numero)} n'existe pas ou a été supprimé.</p>
          <div class="actions"><a class="btn" href="#/">Retour à la liste</a></div>
        </div>`;
      return;
    }

    const moi = utilisateur();
    const n = nbReponses(t);

    app.innerHTML = `
      <a class="back" href="#/">← Tous les tickets</a>
      <section class="ticket-head">
        <div class="muted mono">${esc(t.numero)}</div>
        <h1>${esc(t.titre)}</h1>
        <div class="badges">${badgeStatut(t.statut)} ${badgePrio(t.priorite)} <span class="badge neutre">${esc(t.categorie)}</span></div>
      </section>

      <div class="detail-grid">
        <div>
          <article class="card">
            <h2 class="h-sm">Description</h2>
            <p class="pre">${esc(t.description)}</p>
          </article>

          <section class="card">
            <h2 class="h-sm">Suivi · ${n} réponse${n > 1 ? 's' : ''}</h2>
            <ol class="timeline">${t.evenements.map(rendreEvenement).join('')}</ol>
          </section>

          <section class="card" id="repondre">
            <h2 class="h-sm">Répondre au ticket</h2>
            <form id="form-reponse" class="form" novalidate>
              <div class="row2">
                <label>Votre nom
                  <input name="auteur" required maxlength="80" value="${esc(moi)}" autocomplete="name">
                </label>
                <label>Vous êtes
                  <select name="role">${options(ROLES, moi && moi === t.demandeur ? 'demandeur' : 'technicien')}</select>
                </label>
              </div>
              <label>Message
                <textarea name="texte" rows="4" required placeholder="Votre réponse, une question, l'intervention réalisée…"></textarea>
              </label>
              <div class="form-foot">
                <label class="inline">Passer le ticket en
                  <select name="statut"><option value="">(ne pas changer)</option>${options(STATUTS.filter(([k]) => k !== t.statut))}</select>
                </label>
                <button class="btn btn-primary" type="submit">Envoyer la réponse</button>
              </div>
            </form>
          </section>
        </div>

        <aside>
          <section class="card">
            <h2 class="h-sm">Gestion du ticket</h2>
            <form id="form-gestion" class="form">
              <label>Statut<select name="statut">${options(STATUTS, t.statut)}</select></label>
              <label>Priorité<select name="priorite">${options(PRIORITES, t.priorite)}</select></label>
              <label>Technicien assigné<input name="technicien" maxlength="80" value="${esc(t.technicien)}" placeholder="Non assigné"></label>
              <button class="btn btn-primary" type="submit">Enregistrer</button>
            </form>
          </section>

          <section class="card">
            <h2 class="h-sm">Informations</h2>
            <dl class="infos">
              <dt>Demandeur</dt><dd>${esc(t.demandeur)}</dd>
              ${t.email ? `<dt>Email</dt><dd><a href="mailto:${esc(t.email)}">${esc(t.email)}</a></dd>` : ''}
              <dt>Lieu</dt><dd>${t.lieu ? esc(t.lieu) : '<span class="muted">Non précisé</span>'}</dd>
              <dt>Catégorie</dt><dd>${esc(t.categorie)}</dd>
              <dt>Créé le</dt><dd>${esc(fdate(t.creeLe))}</dd>
              <dt>Activité</dt><dd>${esc(fdate(t.majLe))}</dd>
            </dl>
          </section>

          <button type="button" class="btn btn-danger-ghost" id="btn-suppr">Supprimer le ticket</button>
        </aside>
      </div>`;

    // Répondre
    const formRep = document.getElementById('form-reponse');
    formRep.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!champsValides(formRep)) return;
      const f = new FormData(formRep);
      const auteur = String(f.get('auteur')).trim();
      const role = String(f.get('role'));
      const nouveauStatut = String(f.get('statut') || '');
      memoriserUtilisateur(auteur);
      ajouterEvenement(t, { type: 'reponse', auteur, role, texte: String(f.get('texte')).trim() });
      if (nouveauStatut && nouveauStatut !== t.statut) {
        ajouterEvenement(t, { type: 'statut', auteur, de: t.statut, a: nouveauStatut });
        t.statut = nouveauStatut;
      }
      enregistrer();
      notifier('Réponse ajoutée');
      vueDetail(t.numero);
      document.getElementById('repondre').scrollIntoView({ block: 'center' });
    });

    // Gestion (statut, priorité, assignation)
    document.getElementById('form-gestion').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const auteur = utilisateur() || 'Équipe maintenance';
      const statut = String(f.get('statut'));
      const priorite = String(f.get('priorite'));
      const technicien = String(f.get('technicien') || '').trim();
      let modifie = false;
      if (technicien !== t.technicien) {
        ajouterEvenement(t, { type: 'assignation', auteur, de: t.technicien, a: technicien });
        t.technicien = technicien;
        modifie = true;
      }
      if (priorite !== t.priorite) {
        ajouterEvenement(t, { type: 'priorite', auteur, de: t.priorite, a: priorite });
        t.priorite = priorite;
        modifie = true;
      }
      if (statut !== t.statut) {
        ajouterEvenement(t, { type: 'statut', auteur, de: t.statut, a: statut });
        t.statut = statut;
        modifie = true;
      }
      if (!modifie) { notifier('Aucune modification'); return; }
      enregistrer();
      notifier('Ticket mis à jour');
      vueDetail(t.numero);
    });

    document.getElementById('btn-suppr').addEventListener('click', () => {
      if (!confirm(`Supprimer définitivement le ticket ${t.numero} et tout son suivi ?`)) return;
      donnees.tickets = donnees.tickets.filter((x) => x !== t);
      enregistrer();
      notifier(`Ticket ${t.numero} supprimé`);
      location.hash = '#/';
    });
  }

  // ---------- Exemples ----------
  function chargerExemples() {
    const il = (jours, heures) => new Date(Date.now() - (jours * 24 + (heures || 0)) * 3600e3).toISOString();

    const t1 = creerTicket({
      titre: "Fuite d'eau sous l'évier de la salle de pause",
      description: "Une flaque se forme sous l'évier depuis ce matin. Le siphon semble goutter en continu.\nJ'ai mis un seau en attendant.",
      categorie: 'Plomberie', priorite: 'haute', lieu: 'Bât. A, 1er étage, salle de pause', demandeur: 'Claire Martin', email: 'claire.martin@exemple.fr',
    }, il(2, 5));
    ajouterEvenement(t1, { type: 'assignation', auteur: 'Équipe maintenance', de: '', a: 'Karim Benali', date: il(2, 4) });
    ajouterEvenement(t1, { type: 'statut', auteur: 'Karim Benali', de: 'ouvert', a: 'en_cours', date: il(2, 3) });
    t1.technicien = 'Karim Benali'; t1.statut = 'en_cours';
    ajouterEvenement(t1, { type: 'reponse', auteur: 'Karim Benali', role: 'technicien', texte: "Joint du siphon usé. J'ai coupé l'arrivée d'eau, la pièce est commandée et je la pose demain matin.", date: il(2, 3) });
    ajouterEvenement(t1, { type: 'reponse', auteur: 'Claire Martin', role: 'demandeur', texte: "Merci ! L'évier reste utilisable d'ici là ?", date: il(1, 20) });

    const t2 = creerTicket({
      titre: 'Éclairage en panne dans le couloir du 3e',
      description: 'Trois néons sur cinq ne s’allument plus côté escalier B. Le couloir est très sombre le soir.',
      categorie: 'Électricité', priorite: 'normale', lieu: 'Bât. B, 3e étage', demandeur: 'Julien Roux',
    }, il(5));
    ajouterEvenement(t2, { type: 'assignation', auteur: 'Équipe maintenance', de: '', a: 'Sophie Laurent', date: il(4, 20) });
    t2.technicien = 'Sophie Laurent';
    ajouterEvenement(t2, { type: 'reponse', auteur: 'Sophie Laurent', role: 'technicien', texte: 'Néons remplacés par des tubes LED. Tout fonctionne.', date: il(4, 2) });
    ajouterEvenement(t2, { type: 'statut', auteur: 'Sophie Laurent', de: 'ouvert', a: 'resolu', date: il(4, 2) });
    t2.statut = 'resolu';

    creerTicket({
      titre: 'Climatisation bruyante en salle de réunion',
      description: 'Bruit de cliquetis régulier quand la clim tourne. Gênant pendant les visioconférences.',
      categorie: 'Chauffage / climatisation', priorite: 'basse', lieu: 'Salle Everest', demandeur: 'Nadia Petit',
    }, il(0, 3));

    enregistrer();
    notifier('3 tickets d’exemple chargés');
    vueListe();
  }

  // ---------- Export / import ----------
  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tickets-maintenance-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  document.getElementById('file-import').addEventListener('change', (e) => {
    const fichier = e.target.files[0];
    e.target.value = '';
    if (!fichier) return;
    fichier.text().then((txt) => {
      const d = JSON.parse(txt);
      if (!d || !Array.isArray(d.tickets)) throw new Error('format');
      if (!confirm(`Remplacer les ${donnees.tickets.length} ticket(s) actuels par les ${d.tickets.length} du fichier ?`)) return;
      const maxNum = d.tickets.reduce((m, t) => Math.max(m, parseInt(String(t.numero).replace(/\D/g, ''), 10) || 0), 0);
      donnees = { seq: Math.max(Number(d.seq) || 0, maxNum), tickets: d.tickets };
      enregistrer();
      notifier('Import terminé');
      router();
    }).catch(() => notifier("Fichier invalide : ce n'est pas un export de tickets."));
  });

  // ---------- Navigation ----------
  function router() {
    const h = location.hash.replace(/^#/, '') || '/';
    let page = 'liste';
    const m = h.match(/^\/ticket\/(.+)$/);
    if (h === '/nouveau') { page = 'nouveau'; vueNouveau(); }
    else if (m) { page = 'detail'; vueDetail(decodeURIComponent(m[1])); }
    else vueListe();

    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === page));
    document.title = page === 'nouveau' ? 'Nouveau ticket · Maintenance'
      : page === 'detail' ? `${decodeURIComponent(m[1])} · Maintenance` : 'Tickets de maintenance';
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', router);
  router();
})();
