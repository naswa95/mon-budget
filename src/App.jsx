import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "monbudget-v2";
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });

const today = new Date();
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const isoDate = (d) => `${monthKey(d)}-${String(d.getDate()).padStart(2, "0")}`;
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const blankProfile = (name, salary = 0, annualGoal = 0) => ({
  id: uid(),
  name,
  salary,
  currentSavings: 0,
  annualGoal,
  monthlySavings: {},
  expenses: [],
  incomes: [],
  goals: []
});

const defaultState = {
  onboarded: false,
  activeProfileId: null,
  profiles: [],
  page: "budget",
  selectedMonth: monthKey(today)
};

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed ? { ...defaultState, ...parsed } : defaultState;
  } catch {
    return defaultState;
  }
}

function recurrenceMatches(item, y, m) {
  const start = new Date(`${item.startDate}T12:00:00`);
  const diff = (y - start.getFullYear()) * 12 + (m - start.getMonth());
  if (diff < 0) return false;
  const map = { once: null, monthly: 1, bimonthly: 2, quarterly: 3, halfyear: 6, yearly: 12 };
  if (item.recurrence === "once") return diff === 0;
  return diff % (map[item.recurrence] || 1) === 0;
}

function App() {
  const [state, setState] = useState(loadState);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2200); return () => clearTimeout(t); }, [toast]);

  const active = state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  const selectedDate = new Date(`${state.selectedMonth}-01T12:00:00`);
  const [year, month] = [selectedDate.getFullYear(), selectedDate.getMonth()];

  const monthExpenses = useMemo(() => {
    if (!active) return [];
    return active.expenses.filter((e) => recurrenceMatches(e, year, month)).map((e) => {
      const day = Math.min(new Date(`${e.startDate}T12:00:00`).getDate(), new Date(year, month + 1, 0).getDate());
      return { ...e, displayDate: new Date(year, month, day) };
    });
  }, [active, year, month]);

  const monthIncomes = useMemo(() => {
    if (!active) return [];
    return active.incomes.filter((i) => monthKey(new Date(`${i.date}T12:00:00`)) === state.selectedMonth)
      .map((i) => ({ ...i, displayDate: new Date(`${i.date}T12:00:00`) }));
  }, [active, state.selectedMonth]);

  const totals = useMemo(() => {
    if (!active) return { salary: 0, income: 0, savedIncome: 0, expenses: 0, planned: 0, remainder: 0, savingsTotal: 0, progress: 0 };
    const income = monthIncomes.reduce((s, i) => s + Number(i.amount || 0), 0);
    const savedIncome = monthIncomes.filter((i) => i.saveIt).reduce((s, i) => s + Number(i.amount || 0), 0);
    const expenses = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const planned = Number(active.monthlySavings[state.selectedMonth] || 0);
    const salary = Number(active.salary || 0);
    const savingsTotal = Number(active.currentSavings || 0) + Object.values(active.monthlySavings || {}).reduce((s, v) => s + Number(v || 0), 0) + active.incomes.filter((i) => i.saveIt).reduce((s, i) => s + Number(i.amount || 0), 0);
    const remainder = salary + (income - savedIncome) - planned - expenses;
    const progress = active.annualGoal > 0 ? Math.min(100, (savingsTotal / active.annualGoal) * 100) : 0;
    return { salary, income, savedIncome, expenses, planned, remainder, savingsTotal, progress };
  }, [active, monthExpenses, monthIncomes, state.selectedMonth]);

  const updateProfile = (patch) => setState((s) => ({
    ...s,
    profiles: s.profiles.map((p) => p.id === s.activeProfileId ? { ...p, ...patch } : p)
  }));

  if (!state.onboarded || !active) {
    return <Onboarding onDone={(profile) => setState({ ...defaultState, onboarded: true, profiles: [profile], activeProfileId: profile.id })} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <img src="./icon.png" alt="" onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement.dataset.fallback = "€"; }} />
          </div>
          <div><strong>MonBudget</strong><span>by Anas</span></div>
        </div>
        <ProfileMenu state={state} setState={setState} active={active} />
      </header>

      <main className="main-content">
        {state.page === "budget" ? (
          <BudgetPage
            active={active}
            state={state}
            setState={setState}
            totals={totals}
            monthExpenses={monthExpenses}
            monthIncomes={monthIncomes}
            selectedDate={selectedDate}
            setModal={setModal}
          />
        ) : (
          <GoalsPage active={active} totals={totals} updateProfile={updateProfile} setModal={setModal} />
        )}
      </main>

      <nav className="bottom-nav">
        <button className={state.page === "budget" ? "active" : ""} onClick={() => setState((s) => ({ ...s, page: "budget" }))}>⌁<span>Prélèvements</span></button>
        <button className={state.page === "goals" ? "active" : ""} onClick={() => setState((s) => ({ ...s, page: "goals" }))}>◎<span>Objectifs</span></button>
      </nav>

      {modal?.type === "expense" && <ExpenseModal value={modal.value} month={state.selectedMonth} onClose={() => setModal(null)} onSave={(expense) => { updateProfile({ expenses: modal.value ? active.expenses.map((e) => e.id === expense.id ? expense : e) : [...active.expenses, expense] }); setModal(null); setToast("Prélèvement enregistré"); }} onDelete={modal.value ? () => { updateProfile({ expenses: active.expenses.filter((e) => e.id !== modal.value.id) }); setModal(null); } : null} />}
      {modal?.type === "income" && <IncomeModal value={modal.value} month={state.selectedMonth} onClose={() => setModal(null)} onSave={(income) => { updateProfile({ incomes: modal.value ? active.incomes.map((i) => i.id === income.id ? income : i) : [...active.incomes, income] }); setModal(null); setToast(modal.value ? "Revenu modifié" : "Revenu ajouté"); }} onDelete={modal.value ? () => { updateProfile({ incomes: active.incomes.filter((i) => i.id !== modal.value.id) }); setModal(null); setToast("Revenu supprimé"); } : null} />}
      {modal?.type === "settings" && <SettingsModal active={active} month={state.selectedMonth} onClose={() => setModal(null)} onSave={(patch) => { updateProfile(patch); setModal(null); }} />}
      {modal?.type === "goal" && <GoalModal onClose={() => setModal(null)} onSave={(goal) => { updateProfile({ goals: [...active.goals, goal] }); setModal(null); }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Onboarding({ onDone }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [salary, setSalary] = useState("");
  const [goal, setGoal] = useState("");
  return <div className="onboarding"><div className="welcome-card">
    {step === 1 ? <>
      <div className="welcome-mark">€</div><p className="eyebrow">Bienvenue sur MonBudget</p><h1>Quel est votre prénom ?</h1>
      <p>Suivez vos prélèvements, vos primes, votre épargne et vos futurs achats dans une interface simple pensée pour le téléphone.</p>
      <input autoFocus placeholder="Votre prénom" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="primary" disabled={!name.trim()} onClick={() => setStep(2)}>Continuer</button>
      <small>Anas, pensez à moi quand vous aurez 15k de côté svp</small>
    </> : <>
      <p className="eyebrow">Configuration rapide</p><h1>Votre budget</h1>
      <label>Salaire mensuel<input type="number" inputMode="decimal" placeholder="1600" value={salary} onChange={(e) => setSalary(e.target.value)} /></label>
      <label>Objectif d’épargne d’ici un an<input type="number" inputMode="decimal" placeholder="15000" value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
      <p className="hint">Vous pourrez modifier ces informations plus tard dans « Salaire & épargne ».</p>
      <button className="primary" onClick={() => onDone(blankProfile(name.trim() || "Mon profil", Number(salary), Number(goal)))}>Créer mon espace</button>
    </>}
  </div></div>;
}

function ProfileMenu({ state, setState, active }) {
  const [open, setOpen] = useState(false);
  const create = () => { const name = prompt("Nom du nouveau profil ?"); if (!name?.trim()) return; const p = blankProfile(name.trim()); setState((s) => ({ ...s, profiles: [...s.profiles, p], activeProfileId: p.id })); };
  return <div className="profile-menu"><button onClick={() => setOpen(!open)}><span className="avatar">{active.name[0]?.toUpperCase()}</span><span>{active.name}</span>⌄</button>{open && <div className="profile-popover">{state.profiles.map((p) => <button key={p.id} className={p.id === active.id ? "selected" : ""} onClick={() => { setState((s) => ({ ...s, activeProfileId: p.id })); setOpen(false); }}>{p.name}</button>)}<button className="new-profile" onClick={create}>＋ Nouveau profil</button></div>}</div>;
}

function BudgetPage({ active, state, setState, totals, monthExpenses, monthIncomes, selectedDate, setModal }) {
  return <>
    <section className="hero-card">
      <div><p>Reste sur le mois</p><h2 className={totals.remainder < 0 ? "negative" : ""}>{euro.format(totals.remainder)}</h2><span>{euro.format(totals.salary)} de salaire · {euro.format(totals.expenses)} de prélèvements</span></div>
      <button className="settings-btn" onClick={() => setModal({ type: "settings" })}>Salaire & épargne</button>
    </section>
    <section className="stats-grid">
      <article><span>Épargne totale</span><strong>{euro.format(totals.savingsTotal)}</strong></article>
      <article><span>Objectif annuel</span><strong>{euro.format(active.annualGoal)}</strong></article>
      <article className="wide"><div className="progress-head"><span>Progression</span><strong>{Math.round(totals.progress)} %</strong></div><div className="progress"><i style={{ width: `${totals.progress}%` }} /></div></article>
    </section>
    <section className="toolbar-card">
      <div className="month-switch"><button onClick={() => shiftMonth(state, setState, -1)}>‹</button><strong>{monthFmt.format(selectedDate)}</strong><button onClick={() => shiftMonth(state, setState, 1)}>›</button></div>
      <div className="action-row"><button className="pink" onClick={() => setModal({ type: "income" })}>＋ Ajouter un revenu</button><button className="primary" onClick={() => setModal({ type: "expense" })}>＋ Prélèvement</button></div>
    </section>
    <Calendar month={selectedDate} expenses={monthExpenses} incomes={monthIncomes} onExpense={(e) => setModal({ type: "expense", value: e })} onIncome={(i) => setModal({ type: "income", value: i })} />
  </>;
}

function shiftMonth(state, setState, delta) { const d = new Date(`${state.selectedMonth}-01T12:00:00`); d.setMonth(d.getMonth() + delta); setState((s) => ({ ...s, selectedMonth: monthKey(d) })); }

function Calendar({ month, expenses, incomes, onExpense, onIncome }) {
  const y = month.getFullYear(), m = month.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return <section className="calendar-card"><div className="weekdays">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => <span key={d}>{d}</span>)}</div><div className="calendar-grid">{cells.map((day, idx) => day === null ? <div className="day empty" key={`e-${idx}`} /> : <div className="day" key={day}><b>{day}</b><div className="day-items">{incomes.filter((i) => i.displayDate.getDate() === day).map((i) => <button className="event income" key={i.id} onClick={() => onIncome(i)} aria-label={`Modifier ou supprimer ${i.type}`}><span>{i.type}</span><strong>+{euro.format(i.amount)}</strong></button>)}{expenses.filter((e) => e.displayDate.getDate() === day).map((e) => <button className="event expense" key={e.id} onClick={() => onExpense(e)}><span>{e.name}</span><strong>{euro.format(e.amount)}</strong></button>)}</div></div>)}</div></section>;
}

function GoalsPage({ active, totals, updateProfile, setModal }) {
  return <section className="goals-page"><div className="page-title"><div><p className="eyebrow">Profil {active.name}</p><h1>Objectifs d’achat</h1><p>Votre épargne disponible : <strong>{euro.format(totals.savingsTotal)}</strong></p></div><button className="primary" onClick={() => setModal({ type: "goal" })}>＋ Ajouter</button></div><div className="goal-grid">{active.goals.length === 0 && <div className="empty-state"><span>◎</span><h3>Aucun objectif pour le moment</h3><p>Ajoutez un achat et suivez votre progression.</p></div>}{active.goals.map((g, idx) => { const progress = g.price > 0 ? Math.min(100, totals.savingsTotal / g.price * 100) : 0; return <article className="goal-card" key={g.id}><a className={`goal-media tone-${idx % 6}`} href={g.url || undefined} target="_blank" rel="noreferrer"><span>{g.name}</span>{g.url && <em>Ouvrir le lien ↗</em>}</a><div className="goal-body"><div><h3>{g.name}</h3><strong>{euro.format(g.price)}</strong></div><div className="progress"><i style={{ width: `${progress}%` }} /></div><p>{progress >= 100 ? "Vous pouvez l’acheter" : `Il manque ${euro.format(Math.max(0, g.price - totals.savingsTotal))}`}</p><button className="danger-link" onClick={() => updateProfile({ goals: active.goals.filter((x) => x.id !== g.id) })}>Supprimer</button></div></article>; })}</div></section>;
}

function ExpenseModal({ value, month, onClose, onSave, onDelete }) {
  const [f, setF] = useState(value || { id: uid(), name: "", amount: "", startDate: `${month}-01`, recurrence: "monthly" });
  return <Modal title={value ? "Modifier le prélèvement" : "Nouveau prélèvement"} onClose={onClose}><label>Nom<input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label><label>Montant<input type="number" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label><label>Date de début<input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label><label>Fréquence<select value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value })}><option value="once">Seulement ce mois</option><option value="monthly">Tous les mois</option><option value="bimonthly">Tous les 2 mois</option><option value="quarterly">Tous les 3 mois</option><option value="halfyear">Tous les 6 mois</option><option value="yearly">Tous les ans</option></select></label><div className="modal-actions">{onDelete && <button className="danger" onClick={onDelete}>Supprimer</button>}<button className="primary" disabled={!f.name || !f.amount} onClick={() => onSave({ ...f, amount: Number(f.amount) })}>Enregistrer</button></div></Modal>;
}

function IncomeModal({ value, month, onClose, onSave, onDelete }) {
  const [f, setF] = useState(value || { id: uid(), type: "Prime", amount: "", date: `${month}-01`, saveIt: false, note: "" });
  return <Modal title={value ? "Modifier le revenu" : "Ajouter un revenu"} accent="pink" onClose={onClose}><label>Type<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{["Prime", "Intéressement", "Participation", "Cadeau", "Remboursement", "Vente", "Autre"].map((x) => <option key={x}>{x}</option>)}</select></label><label>Montant<input type="number" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label><label>Date<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label><label>Note facultative<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label><label className="check"><input type="checkbox" checked={f.saveIt} onChange={(e) => setF({ ...f, saveIt: e.target.checked })} /><span>Ajouter directement ce revenu à mon épargne</span></label><div className="modal-actions">{onDelete && <button className="danger" onClick={onDelete}>Supprimer</button>}<button className="pink" disabled={!f.amount} onClick={() => onSave({ ...f, amount: Number(f.amount) })}>{value ? "Enregistrer" : "Ajouter le revenu"}</button></div></Modal>;
}

function SettingsModal({ active, month, onClose, onSave }) {
  const [salary, setSalary] = useState(active.salary);
  const [currentSavings, setCurrentSavings] = useState(active.currentSavings);
  const [annualGoal, setAnnualGoal] = useState(active.annualGoal);
  const [planned, setPlanned] = useState(active.monthlySavings[month] || 0);
  return <Modal title="Salaire & épargne" onClose={onClose}><label>Salaire mensuel<input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} /></label><label>Épargne déjà disponible<input type="number" value={currentSavings} onChange={(e) => setCurrentSavings(e.target.value)} /></label><label>Objectif d’épargne sur un an<input type="number" value={annualGoal} onChange={(e) => setAnnualGoal(e.target.value)} /></label><label>À mettre de côté ce mois<input type="number" value={planned} onChange={(e) => setPlanned(e.target.value)} /></label><button className="primary full" onClick={() => onSave({ salary: Number(salary), currentSavings: Number(currentSavings), annualGoal: Number(annualGoal), monthlySavings: { ...active.monthlySavings, [month]: Number(planned) } })}>Enregistrer</button></Modal>;
}

function GoalModal({ onClose, onSave }) {
  const [f, setF] = useState({ id: uid(), name: "", price: "", url: "" });
  return <Modal title="Nouvel objectif" onClose={onClose}><label>Nom de l’achat<input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label><label>Prix<input type="number" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label><label>Lien TikTok, YouTube ou site<input type="url" placeholder="https://..." value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></label><button className="primary full" disabled={!f.name || !f.price} onClick={() => onSave({ ...f, price: Number(f.price) })}>Créer l’objectif</button></Modal>;
}

function Modal({ title, accent, onClose, children }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${accent || ""}`} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button onClick={onClose}>×</button></div>{children}</div></div>; }

export default App;
