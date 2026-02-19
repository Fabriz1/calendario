import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, arrayUnion, arrayRemove, runTransaction, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDuYQqNPgdQ6e5sO7hzMnrrmzg7cBmHusA",
    authDomain: "calendario-79a93.firebaseapp.com",
    projectId: "calendario-79a93",
    storageBucket: "calendario-79a93.appspot.com",
    messagingSenderId: "981317951328",
    appId: "1:981317951328:web:38b9b95bfe654b4904c805"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let calendar;
let allClients = [];
let currentClientId = null;

document.addEventListener('DOMContentLoaded', () => {
    initCalendar();
    
    // Listener Clienti
    onSnapshot(query(collection(db, "clients"), orderBy("name")), (snap) => {
        allClients = snap.docs.map(d => ({id: d.id, ...d.data()}));
        renderClientsList();
        updateClientSelect();
        if(currentClientId) renderClientDossier(currentClientId);
    });

    // Listener Eventi
    onSnapshot(collection(db, "events"), (snap) => {
        const events = snap.docs.map(d => {
            const data = d.data();
            let className = 'evt-task';
            if(data.type === 'lesson') className = 'evt-lesson';
            if(data.type === 'shift') className = 'evt-shift';
            return {
                id: d.id,
                title: data.title,
                start: data.start,
                end: data.end,
                classNames: [className],
                extendedProps: data
            };
        });
        calendar.removeAllEvents();
        calendar.addEventSource(events);
    });

    document.getElementById('clientSearch').addEventListener('input', (e) => renderClientsList(e.target.value));

    // Export functions
    window.showView = showView;
    window.openEventModal = openEventModal;
    window.toggleEventFields = toggleEventFields;
    window.saveEvent = saveEvent;
    window.deleteEvent = deleteEvent;
    window.createClient = createClient;
    window.renderClientDossier = renderClientDossier;
    window.confirmPackageSale = confirmPackageSale;
    window.confirmPayment = confirmPayment;
    window.togglePendingTask = togglePendingTask;
    window.checkClientPackageStatus = checkClientPackageStatus;
    window.showHistory = showHistory;
    window.deleteHistoryItem = deleteHistoryItem;
    
    window.addPackageModal = (cid) => {
        document.getElementById('pkgClientId').value = cid;
        new bootstrap.Modal(document.getElementById('addPackageModal')).show();
    };
    window.addPaymentModal = (cid) => {
        document.getElementById('payClientId').value = cid;
        new bootstrap.Modal(document.getElementById('addPaymentModal')).show();
    };
});

function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    if(viewId === 'calendar') {
        document.getElementById('view-calendar').style.display = 'block';
        document.querySelector('.nav-item:nth-child(1)').classList.add('active');
        document.getElementById('header-actions').innerHTML = '';
        setTimeout(() => calendar.updateSize(), 100);
    } else if (viewId === 'clients') {
        document.getElementById('view-clients').style.display = 'block';
        document.querySelector('.nav-item:nth-child(2)').classList.add('active');
        document.getElementById('header-actions').innerHTML = 
            `<button class="btn btn-sm btn-primary" data-bs-toggle="modal" data-bs-target="#newClientModal"><i class="bi bi-person-plus"></i></button>`;
        currentClientId = null;
    } else if (viewId === 'dossier') {
        document.getElementById('view-dossier').style.display = 'block';
        document.getElementById('header-actions').innerHTML = '';
    }
}

// --- CALENDAR SETUP (DRAG & DROP) ---
function initCalendar() {
    const el = document.getElementById('calendar-wrapper');
    calendar = new FullCalendar.Calendar(el, {
        initialView: 'timeGridThreeDay',
        views: { timeGridThreeDay: { type: 'timeGrid', duration: { days: 3 }, buttonText: '3 Giorni' } },
        locale: 'it', firstDay: 1, height: 'auto',
        headerToolbar: { left: 'prev,next', center: 'title', right: 'dayGridMonth,timeGridThreeDay' },
        slotMinTime: "06:00:00", slotMaxTime: "23:00:00", allDaySlot: false,
        
        // DRAG & DROP ENABLED
        editable: true, 
        droppable: true,
        
        eventDrop: handleEventDropOrResize,
        eventResize: handleEventDropOrResize,
        dateClick: (info) => openEventModal(info.date),
        eventClick: (info) => openEventModal(null, info.event),
        eventContent: (arg) => {
            const p = arg.event.extendedProps;
            let icon = p.type === 'lesson' ? 'bi-person-fill' : (p.type === 'shift' ? 'bi-clock' : 'bi-sticky');
            return { html: `<div class="d-flex align-items-center small" style="overflow:hidden;"><i class="bi ${icon} me-1"></i> <span class="fw-bold text-truncate">${arg.event.title}</span></div>` };
        }
    });
    calendar.render();
}

// Gestione Spostamento/Allungamento Evento
async function handleEventDropOrResize(info) {
    const event = info.event;
    await updateDoc(doc(db, "events", event.id), {
        start: event.start.toISOString(),
        end: event.end.toISOString()
    });
}

// --- EVENTI ---
function openEventModal(date = null, event = null) {
    document.getElementById('eventForm').reset();
    const modal = new bootstrap.Modal(document.getElementById('eventModal'));
    
    if (event) {
        // MODIFICA
        const p = event.extendedProps;
        document.getElementById('evtId').value = event.id;
        document.getElementById('evtDate').value = toDateStr(event.start);
        document.getElementById('evtTime').value = toTimeStr(event.start);
        document.getElementById('evtNotes').value = p.notes || '';
        document.getElementById('btnDeleteEvent').classList.remove('d-none');
        
        // Calcolo Durata in minuti
        const diffMs = event.end - event.start;
        const diffMins = Math.round(diffMs / 60000);
        
        // Cerca valore più vicino nel select o imposta manuale se necessario (qui semplifichiamo ai preset)
        let durSelect = document.getElementById('evtDuration');
        if([...durSelect.options].some(o => o.value == diffMins)) {
            durSelect.value = diffMins;
        } else {
            // Se durata strana, defaulta a 60
            durSelect.value = 60;
        }

        document.querySelector(`input[name="evtType"][value="${p.type}"]`).checked = true;
        
        if (p.type === 'lesson') document.getElementById('evtClient').value = p.clientId || '';
        else document.getElementById('evtTitle').value = event.title;
        
    } else {
        // NUOVO
        let d = date ? new Date(date) : new Date();
        if(!date) d.setMinutes(0,0,0);
        document.getElementById('evtDate').value = toDateStr(d);
        document.getElementById('evtTime').value = toTimeStr(d);
        document.getElementById('evtId').value = '';
        document.getElementById('btnDeleteEvent').classList.add('d-none');
        document.querySelector('#type_lesson').checked = true;
        document.getElementById('evtDuration').value = "60";
    }
    toggleEventFields();
    modal.show();
}

function toggleEventFields() {
    const type = document.querySelector('input[name="evtType"]:checked').value;
    document.getElementById('field-client').classList.toggle('d-none', type !== 'lesson');
    document.getElementById('field-title').classList.toggle('d-none', type === 'lesson');
}

function checkClientPackageStatus() {
    const cid = document.getElementById('evtClient').value;
    const hint = document.getElementById('package-hint');
    if (!cid) { hint.classList.add('d-none'); return; }
    const c = allClients.find(x => x.id === cid);
    if (c && c.activePackage && c.activePackage.sessionsRemaining > 0) {
        hint.classList.remove('d-none');
        document.getElementById('pkg-rem').innerText = c.activePackage.sessionsRemaining;
    } else { hint.classList.add('d-none'); }
}

async function saveEvent() {
    const id = document.getElementById('evtId').value;
    const type = document.querySelector('input[name="evtType"]:checked').value;
    const date = document.getElementById('evtDate').value;
    const time = document.getElementById('evtTime').value;
    const duration = parseInt(document.getElementById('evtDuration').value);

    if(!date || !time) return alert("Data/Ora obbligatori");

    const startIso = `${date}T${time}`;
    const startDate = new Date(startIso);
    const endDate = new Date(startDate.getTime() + duration * 60000);
    const endIso = endDate.toISOString();

    let data = { type, start: startDate.toISOString(), end: endIso, notes: document.getElementById('evtNotes').value };

    if (type === 'lesson') {
        const cid = document.getElementById('evtClient').value;
        if (!cid) return alert("Seleziona un cliente");
        const client = allClients.find(c => c.id === cid);
        data.clientId = cid;
        data.clientName = client.name;
        data.title = client.name;

        // Decremento Pacchetto (solo se nuovo)
        if (!id && client.activePackage && client.activePackage.sessionsRemaining > 0) {
            await updateDoc(doc(db, "clients", cid), {
                "activePackage.sessionsRemaining": client.activePackage.sessionsRemaining - 1
            });
        }
    } else {
        data.title = document.getElementById('evtTitle').value || (type==='shift'?'Turno':'Note');
    }

    if (id) await updateDoc(doc(db, "events", id), data);
    else await addDoc(collection(db, "events"), data);
    bootstrap.Modal.getInstance(document.getElementById('eventModal')).hide();
}

async function deleteEvent() {
    if(!confirm("Eliminare?")) return;
    await deleteDoc(doc(db, "events", document.getElementById('evtId').value));
    bootstrap.Modal.getInstance(document.getElementById('eventModal')).hide();
}

// --- CLIENTI & DOSSIER ---
function renderClientsList(filter = "") {
    const list = document.getElementById('clients-list');
    list.innerHTML = '';
    const filtered = allClients.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
    
    filtered.forEach(c => {
        const balance = c.balance || 0;
        const colorClass = balance < 0 ? 'balance-negative' : 'balance-positive';
        list.innerHTML += `
            <a href="#" class="client-item" onclick="renderClientDossier('${c.id}')">
                <div class="d-flex align-items-center">
                    <div class="client-avatar">${c.name.charAt(0).toUpperCase()}</div>
                    <div><div class="fw-bold">${c.name}</div><div class="small text-muted">${c.phone||''}</div></div>
                </div>
                <div class="text-end">
                    <div class="small ${colorClass}">${balance}€</div>
                    ${c.pendingTasks && c.pendingTasks.length > 0 ? '<i class="bi bi-exclamation-circle-fill text-warning"></i>' : ''}
                </div>
            </a>
        `;
    });
}

function updateClientSelect() {
    const sel = document.getElementById('evtClient');
    const curr = sel.value;
    sel.innerHTML = '<option value="">Seleziona...</option>';
    allClients.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.name}</option>`);
    sel.value = curr;
}

async function createClient() {
    const name = document.getElementById('ncName').value;
    if(!name) return;
    await addDoc(collection(db, "clients"), {
        name, phone: document.getElementById('ncPhone').value, notes: document.getElementById('ncNotes').value,
        balance: 0, pendingTasks: []
    });
    bootstrap.Modal.getInstance(document.getElementById('newClientModal')).hide();
}

function renderClientDossier(cid) {
    currentClientId = cid;
    showView('dossier');
    const client = allClients.find(c => c.id === cid);
    document.getElementById('dossierTitle').innerText = client.name;
    const container = document.getElementById('dossier-content');
    
    const balance = client.balance || 0;
    const balClass = balance < 0 ? 'balance-negative' : 'balance-positive';
    const balText = balance < 0 ? `Deve: ${Math.abs(balance)}€` : `Credito: ${balance}€`;

    // Pacchetto
    let pkgHtml = `<div class="p-3 card-dark text-center text-muted mb-3">Nessun pacchetto attivo</div>`;
    if (client.activePackage && client.activePackage.sessionsRemaining > 0) {
        const p = client.activePackage;
        const progress = ((p.totalSessions - p.sessionsRemaining) / p.totalSessions) * 100;
        pkgHtml = `
            <div class="card-dark border-start border-4 border-primary">
                <div class="d-flex justify-content-between mb-2"><strong>${p.name}</strong><span class="badge bg-primary">${p.sessionsRemaining} rimaste</span></div>
                <div class="progress bg-secondary" style="height: 6px;"><div class="progress-bar bg-primary" style="width: ${progress}%"></div></div>
                <div class="small text-muted mt-1 text-end">${p.totalSessions - p.sessionsRemaining}/${p.totalSessions} usate</div>
            </div>`;
    }

    // Tasks
    const tasks = ['Scheda', 'Video Check', 'Pagamento'];
    let taskHtml = '';
    tasks.forEach(t => {
        const isActive = client.pendingTasks && client.pendingTasks.includes(t);
        const cls = isActive ? 'btn-warning text-dark' : 'btn-outline-secondary';
        const icon = isActive ? 'bi-check-circle-fill' : 'bi-circle';
        taskHtml += `<button class="btn btn-sm ${cls} me-2 mb-2" onclick="togglePendingTask('${cid}','${t}',${isActive})"><i class="bi ${icon}"></i> ${t}</button>`;
    });

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <a href="tel:${client.phone}" class="btn btn-outline-light btn-sm"><i class="bi bi-telephone"></i> Chiama</a>
        </div>

        <div class="card-dark d-flex align-items-center justify-content-between">
            <div><div class="small text-muted uppercase">Bilancio</div><div class="fs-4 ${balClass}">${balText}</div></div>
            <div class="d-flex flex-column gap-2">
                <button class="btn btn-sm btn-success" onclick="addPaymentModal('${cid}')">Incassa</button>
                <button class="btn btn-sm btn-outline-light" onclick="showHistory('${cid}')"><i class="bi bi-clock-history"></i> Storico</button>
            </div>
        </div>

        <div class="mb-3"><div class="small text-muted fw-bold mb-2">DA FARE</div>${taskHtml}</div>

        <h5 class="fw-bold mt-4">Pacchetto</h5>
        ${pkgHtml}
        <button class="btn btn-dark border-secondary w-100 mb-4" onclick="addPackageModal('${cid}')">Nuovo Pacchetto</button>

        <h5 class="fw-bold">Note</h5>
        <textarea class="form-control mb-3 bg-dark text-light" rows="6" onblur="updateDoc(doc(db,'clients','${cid}'), {notes: this.value})">${client.notes || ''}</textarea>
    `;
}

// --- ECONOMIA & STORICO (MODIFICABILE) ---

async function confirmPackageSale() {
    const cid = document.getElementById('pkgClientId').value;
    const name = document.getElementById('pkgName').value;
    const sessions = parseInt(document.getElementById('pkgSessions').value);
    const price = parseFloat(document.getElementById('pkgPrice').value);
    const isPaid = document.getElementById('pkgPaidNow').checked;

    if(!name) return;

    await runTransaction(db, async (t) => {
        const cRef = doc(db, "clients", cid);
        const cDoc = await t.get(cRef);
        const bal = cDoc.data().balance || 0;
        
        // Se pagato subito, bilancio non cambia (Debito creato e subito saldato). Se no, scende.
        const newBal = isPaid ? bal : (bal - price);

        t.update(cRef, { 
            balance: newBal, 
            activePackage: { name, totalSessions: sessions, sessionsRemaining: sessions, date: new Date().toISOString() } 
        });

        // 1. Debito Pacchetto
        const histRef = doc(collection(db, "clients", cid, "history"));
        t.set(histRef, { type: 'debt', desc: `Pack: ${name}`, amount: -price, date: new Date().toISOString() });

        // 2. Se pagato subito, aggiungi anche il pagamento
        if(isPaid) {
            const payRef = doc(collection(db, "clients", cid, "history"));
            t.set(payRef, { type: 'payment', desc: `Pagamento immediato ${name}`, amount: price, date: new Date().toISOString() });
        }
    });
    bootstrap.Modal.getInstance(document.getElementById('addPackageModal')).hide();
}

async function confirmPayment() {
    const cid = document.getElementById('payClientId').value;
    const amount = parseFloat(document.getElementById('payAmount').value);
    const note = document.getElementById('payNote').value || "Pagamento";
    if(!amount) return;

    await runTransaction(db, async (t) => {
        const cRef = doc(db, "clients", cid);
        const bal = (await t.get(cRef)).data().balance || 0;
        t.update(cRef, { balance: bal + amount });
        const histRef = doc(collection(db, "clients", cid, "history"));
        t.set(histRef, { type: 'payment', desc: note, amount: amount, date: new Date().toISOString() });
    });
    bootstrap.Modal.getInstance(document.getElementById('addPaymentModal')).hide();
}

// Visualizza Storico
async function showHistory(cid) {
    document.getElementById('histClientId').value = cid;
    const list = document.getElementById('history-list');
    list.innerHTML = '<div class="text-center text-muted"><div class="spinner-border spinner-border-sm"></div></div>';
    new bootstrap.Modal(document.getElementById('historyModal')).show();

    const snap = await getDocs(query(collection(db, "clients", cid, "history"), orderBy("date", "desc")));
    list.innerHTML = '';
    
    if(snap.empty) { list.innerHTML = "<small class='text-muted p-2'>Nessun movimento.</small>"; return; }

    snap.forEach(d => {
        const h = d.data();
        const isPos = h.amount > 0;
        const color = isPos ? 'text-success' : 'text-danger';
        const dateStr = new Date(h.date).toLocaleDateString();
        
        list.innerHTML += `
            <div class="history-item bg-dark rounded p-2 mb-2 border border-secondary">
                <div>
                    <div class="fw-bold text-white">${h.desc}</div>
                    <div class="small text-muted">${dateStr}</div>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <span class="fw-bold ${color}">${h.amount}€</span>
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteHistoryItem('${cid}', '${d.id}', ${h.amount})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
}

// Elimina riga storico e storna saldo
async function deleteHistoryItem(cid, hid, originalAmount) {
    if(!confirm("Eliminando questo movimento il saldo verrà ricalcolato. Procedere?")) return;
    
    await runTransaction(db, async (t) => {
        const cRef = doc(db, "clients", cid);
        const bal = (await t.get(cRef)).data().balance || 0;
        
        // Se elimino un pagamento (+50), il saldo deve scendere (-50).
        // Se elimino un debito (-50), il saldo deve salire (+50 -(-50)).
        const correction = -originalAmount;
        
        t.update(cRef, { balance: bal + correction });
        t.delete(doc(db, "clients", cid, "history", hid));
    });
    
    showHistory(cid); // Ricarica lista
}

async function togglePendingTask(cid, task, active) {
    await updateDoc(doc(db, "clients", cid), { pendingTasks: active ? arrayRemove(task) : arrayUnion(task) });
}

// Utils
function toDateStr(d) { return d.toISOString().split('T')[0]; }
function toTimeStr(d) { return d.toTimeString().split(' ')[0].substring(0,5); }