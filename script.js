/* ---------------- STORAGE ---------------- */
const STORAGE_KEY = 'revisao_ativa_data_v1';

function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return {topics:[], reviews:[], completedDeadlines:{}};
  try{
    const parsed = JSON.parse(raw);
    if(!parsed.completedDeadlines) parsed.completedDeadlines = {};
    return parsed;
  }catch(e){ return {topics:[], reviews:[], completedDeadlines:{}}; }
}
function saveData(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadData();

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ---------------- TABS ---------------- */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-'+btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab==='dashboard') renderDashboard();
    if(btn.dataset.tab==='history') renderHistory();
    if(btn.dataset.tab==='review') renderReviewTopicOptions();
    if(btn.dataset.tab==='schedule') renderSchedule();
  });
});

/* ---------------- TOPICS ---------------- */
document.getElementById('formTopic').addEventListener('submit', e=>{
  e.preventDefault();
  const name = document.getElementById('topicName').value.trim();
  const subject = document.getElementById('topicSubject').value.trim();
  const studyDate = document.getElementById('topicStudyDate').value;
  if(!name || !subject || !studyDate) return;
  state.topics.push({
    id: uid(),
    name, subject,
    studyDate,
    createdAt: new Date().toISOString().slice(0,10),
    reviewSchedule: buildReviewSchedule(studyDate)
  });
  saveData();
  document.getElementById('formTopic').reset();
  renderTopics();
  renderSchedule();
  toast('Tópico adicionado! Cronograma gerado.');
});

document.getElementById('btnTodayTopic').addEventListener('click', ()=>{
  document.getElementById('topicStudyDate').valueAsDate = new Date();
});

function addDays(dateStr, days){
  const d = new Date(dateStr+'T00:00:00');
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}

function buildReviewSchedule(studyDate){
  return [1,7,15,30].map(days=>({
    days,
    date: addDays(studyDate, days)
  }));
}

function daysSince(dateStr){
  const d1 = new Date(dateStr);
  const d2 = new Date();
  return Math.floor((d2-d1)/(1000*60*60*24));
}

function getTopicLastReview(topicId){
  const revs = state.reviews.filter(r=>r.topicId===topicId).sort((a,b)=>new Date(b.date)-new Date(a.date));
  return revs[0] || null;
}

function renderTopics(){
  const list = document.getElementById('topicList');
  if(state.topics.length===0){
    list.innerHTML = '<div class="empty">Nenhum tópico cadastrado ainda.</div>';
    return;
  }
  list.innerHTML = state.topics.map(t=>{
    const last = getTopicLastReview(t.id);
    let badge = '<span class="badge soon">Novo</span>';
    let meta = t.subject;
    if(last){
      const d = daysSince(last.date);
      meta = `${t.subject} • Última revisão há ${d} dia(s)`;
      if(d >= 15) badge = '<span class="badge due">Revisar agora</span>';
      else if(d >= 6) badge = '<span class="badge soon">Revisar em breve</span>';
      else badge = '<span class="badge ok">Em dia</span>';
    }
    return `
      <div class="topic-item">
        <div class="info">
          <div class="name">${t.name} ${badge}</div>
          <div class="meta">${meta}</div>
        </div>
        <div class="actions">
          <button class="btn-secondary btn-sm" onclick="deleteTopic('${t.id}')">Excluir</button>
        </div>
      </div>`;
  }).join('');
}

function deleteTopic(id){
  if(!confirm('Excluir este tópico e todas as revisões associadas?')) return;
  state.topics = state.topics.filter(t=>t.id!==id);
  state.reviews = state.reviews.filter(r=>r.topicId!==id);
  saveData();
  renderTopics();
  renderReviewTopicOptions();
  renderHistory();
  renderDashboard();
  renderSchedule();
}

/* ---------------- SCHEDULE ---------------- */
function todayStr(){
  return new Date().toISOString().slice(0,10);
}

function deadlineKey(topicId, date){
  return topicId + '_' + date;
}

function isDeadlineDone(topic, deadlineDate){
  // Cumprido se marcado manualmente OU se existe alguma revisão do tópico registrada na data do prazo ou depois
  if(state.completedDeadlines[deadlineKey(topic.id, deadlineDate)]) return true;
  return state.reviews.some(r => r.topicId===topic.id && r.date >= deadlineDate);
}

function toggleDeadlineDone(topicId, date){
  const key = deadlineKey(topicId, date);
  if(state.completedDeadlines[key]){
    delete state.completedDeadlines[key];
  } else {
    state.completedDeadlines[key] = true;
  }
  saveData();
  renderSchedule();
  renderTopics();
}

function renderSchedule(){
  const container = document.getElementById('scheduleList');
  if(state.topics.length===0){
    container.innerHTML = '<div class="empty">Nenhum tópico cadastrado ainda.</div>';
    return;
  }

  const today = todayStr();

  // Monta uma lista plana de prazos com referência ao tópico
  let entries = [];

  state.topics.forEach(t=>{
    const schedule = t.reviewSchedule && t.reviewSchedule.length ? t.reviewSchedule : buildReviewSchedule(t.studyDate || t.createdAt);
    schedule.forEach(item=>{
      const done = isDeadlineDone(t, item.date);
      entries.push({ topic: t, days: item.days, date: item.date, done });
    });
  });

  // Ordena: pendentes primeiro (da mais próxima para a mais distante), concluídas por último
  entries.sort((a,b)=>{
    if(a.done !== b.done) return a.done ? 1 : -1;
    return a.date.localeCompare(b.date);
  });

  function renderRow(entry){
    const badge = entry.done
      ? '<span class="badge done">Concluída</span>'
      : (entry.date < today
        ? '<span class="badge due">Atrasada</span>'
        : (entry.date === today ? '<span class="badge soon">Hoje</span>' : '<span class="badge ok">Agendada</span>'));
    return `
      <div class="schedule-row${entry.done ? ' is-done' : ''}">
        <div class="sr-info">
          <div class="sr-label">${entry.topic.name} <span style="color:var(--muted);font-weight:400;">(${entry.topic.subject})</span></div>
          <div class="sr-date">Revisão de ${entry.days} dia(s) • ${formatDate(entry.date)}</div>
        </div>
        <div class="sr-right">
          ${badge}
          <label class="sr-check">
            <input type="checkbox" ${entry.done ? 'checked' : ''} onchange="toggleDeadlineDone('${entry.topic.id}','${entry.date}')">
            Feita
          </label>
        </div>
      </div>`;
  }

  container.innerHTML = entries.length ? entries.map(renderRow).join('') : '<div class="empty">Nenhum prazo encontrado.</div>';
}

/* ---------------- REVIEW FORM ---------------- */
function renderReviewTopicOptions(){
  const sel = document.getElementById('reviewTopic');
  if(state.topics.length===0){
    sel.innerHTML = '<option value="">Cadastre um tópico primeiro</option>';
    return;
  }
  sel.innerHTML = state.topics.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
}

document.getElementById('reviewDate').valueAsDate = new Date();

document.getElementById('formReview').addEventListener('submit', e=>{
  e.preventDefault();
  const topicId = document.getElementById('reviewTopic').value;
  if(!topicId){ toast('Cadastre um tópico primeiro.'); return; }
  const correct = parseInt(document.getElementById('reviewCorrect').value)||0;
  const wrong = parseInt(document.getElementById('reviewWrong').value)||0;
  const date = document.getElementById('reviewDate').value;
  const notes = document.getElementById('reviewNotes').value.trim();

  state.reviews.push({
    id: uid(),
    topicId, correct, wrong, date, notes
  });
  saveData();
  document.getElementById('formReview').reset();
  document.getElementById('reviewDate').valueAsDate = new Date();
  renderTopics();
  renderHistory();
  renderDashboard();
  toast('Revisão registrada!');
});

/* ---------------- HISTORY ---------------- */
function renderFilterOptions(){
  const sel = document.getElementById('filterTopic');
  sel.innerHTML = '<option value="all">Todos os tópicos</option>' +
    state.topics.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
}
document.getElementById('filterTopic').addEventListener('change', renderHistory);

function topicName(id){
  const t = state.topics.find(t=>t.id===id);
  return t ? t.name : '(tópico removido)';
}

function renderHistory(){
  renderFilterOptions();
  const filter = document.getElementById('filterTopic').value || 'all';
  let revs = [...state.reviews].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(filter!=='all') revs = revs.filter(r=>r.topicId===filter);

  const list = document.getElementById('historyList');
  if(revs.length===0){
    list.innerHTML = '<div class="empty">Nenhuma revisão registrada ainda.</div>';
    return;
  }
  list.innerHTML = revs.map(r=>{
    const total = r.correct + r.wrong;
    const perc = total>0 ? ((r.correct/total)*100).toFixed(1) : '0.0';
    const color = perc>=70 ? 'var(--accent2)' : (perc>=50 ? 'var(--accent)' : 'var(--danger)');
    return `
      <div class="review-entry">
        <div class="top-row">
          <span>${topicName(r.topicId)}</span>
          <span class="perc" style="color:${color}">${perc}%</span>
        </div>
        <div>✅ ${r.correct} acertos   ❌ ${r.wrong} erros   <span class="date">${formatDate(r.date)}</span></div>
        ${r.notes ? `<div style="margin-top:4px;color:var(--muted);">${r.notes}</div>` : ''}
        <div style="margin-top:6px;"><button class="btn-danger btn-sm" onclick="deleteReview('${r.id}')">Excluir</button></div>
      </div>`;
  }).join('');
}

function formatDate(d){
  const [y,m,day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function deleteReview(id){
  if(!confirm('Excluir esta revisão?')) return;
  state.reviews = state.reviews.filter(r=>r.id!==id);
  saveData();
  renderHistory();
  renderTopics();
  renderDashboard();
  renderSchedule();
}

/* ---------------- DASHBOARD ---------------- */
let chartAE, chartAP, chartPM;

function renderSummaryBoxes(){
  const totalCorrect = state.reviews.reduce((s,r)=>s+r.correct,0);
  const totalWrong = state.reviews.reduce((s,r)=>s+r.wrong,0);
  const totalQ = totalCorrect+totalWrong;
  const perc = totalQ>0 ? ((totalCorrect/totalQ)*100).toFixed(1) : '0.0';

  const box = document.getElementById('summaryBoxes');
  box.innerHTML = `
    <div class="stat-box blue"><div class="val">${state.reviews.length}</div><div class="lab">Revisões</div></div>
    <div class="stat-box green"><div class="val">${totalCorrect}</div><div class="lab">Acertos</div></div>
    <div class="stat-box red"><div class="val">${totalWrong}</div><div class="lab">Erros</div></div>
    <div class="stat-box blue"><div class="val">${totalQ}</div><div class="lab">Total de Questões</div></div>
    <div class="stat-box green"><div class="val">${perc}%</div><div class="lab">Aproveitamento</div></div>
    <div class="stat-box blue"><div class="val">${state.topics.length}</div><div class="lab">Tópicos</div></div>
  `;
}

function renderDashboard(){
  renderSummaryBoxes();

  const revsSorted = [...state.reviews].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const labels = revsSorted.map(r=>formatDate(r.date));
  const corrects = revsSorted.map(r=>r.correct);
  const wrongs = revsSorted.map(r=>r.wrong);
  const percs = revsSorted.map(r=>{
    const t = r.correct+r.wrong;
    return t>0 ? +((r.correct/t)*100).toFixed(1) : 0;
  });

  const ctxAE = document.getElementById('chartAcertosErros').getContext('2d');
  if(chartAE) chartAE.destroy();
  chartAE = new Chart(ctxAE, {
    type:'bar',
    data:{
      labels,
      datasets:[
        {label:'Acertos', data:corrects, backgroundColor:'#7ee0c1'},
        {label:'Erros', data:wrongs, backgroundColor:'#ff6b81'}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      scales:{ x:{ticks:{color:'#a2a8c0'}}, y:{ticks:{color:'#a2a8c0'},beginAtZero:true} },
      plugins:{ legend:{labels:{color:'#eef0f7'}} }
    }
  });

  const ctxAP = document.getElementById('chartAproveitamento').getContext('2d');
  if(chartAP) chartAP.destroy();
  chartAP = new Chart(ctxAP, {
    type:'line',
    data:{
      labels,
      datasets:[{
        label:'Aproveitamento (%)',
        data:percs,
        borderColor:'#6c8cff',
        backgroundColor:'rgba(108,140,255,.2)',
        tension:.3,
        fill:true,
        pointBackgroundColor:'#6c8cff'
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      scales:{ x:{ticks:{color:'#a2a8c0'}}, y:{ticks:{color:'#a2a8c0'},min:0,max:100} },
      plugins:{ legend:{labels:{color:'#eef0f7'}} }
    }
  });

  const subjMap = {};
  state.topics.forEach(t=>{ subjMap[t.subject] = subjMap[t.subject] || {correct:0,wrong:0}; });
  state.reviews.forEach(r=>{
    const t = state.topics.find(t=>t.id===r.topicId);
    if(!t) return;
    subjMap[t.subject].correct += r.correct;
    subjMap[t.subject].wrong += r.wrong;
  });
  const subjLabels = Object.keys(subjMap);
  const subjPerc = subjLabels.map(s=>{
    const {correct,wrong} = subjMap[s];
    const tot = correct+wrong;
    return tot>0 ? +((correct/tot)*100).toFixed(1) : 0;
  });

  const ctxPM = document.getElementById('chartPorMateria').getContext('2d');
  if(chartPM) chartPM.destroy();
  chartPM = new Chart(ctxPM, {
    type:'bar',
    data:{
      labels: subjLabels,
      datasets:[{
        label:'Aproveitamento por matéria (%)',
        data: subjPerc,
        backgroundColor:'#6c8cff'
      }]
    },
    options:{
      indexAxis:'y',
      responsive:true, maintainAspectRatio:false,
      scales:{ x:{ticks:{color:'#a2a8c0'},min:0,max:100}, y:{ticks:{color:'#a2a8c0'}} },
      plugins:{ legend:{display:false} }
    }
  });
}

/* ---------------- EXPORT / IMPORT ---------------- */
document.getElementById('btnExportJson').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  downloadBlob(blob, 'revisao_ativa_backup.json');
  toast('JSON exportado!');
});

document.getElementById('btnExportXlsx').addEventListener('click', ()=>{
  const wb = XLSX.utils.book_new();

  const topicsSheet = state.topics.map(t=>({
    ID: t.id, Nome: t.name, Materia: t.subject, CriadoEm: t.createdAt
  }));
  const reviewsSheet = state.reviews.map(r=>({
    ID: r.id,
    Topico: topicName(r.topicId),
    Materia: (state.topics.find(t=>t.id===r.topicId)||{}).subject || '',
    Data: r.date,
    Acertos: r.correct,
    Erros: r.wrong,
    Total: r.correct+r.wrong,
    Aproveitamento: (r.correct+r.wrong)>0 ? +((r.correct/(r.correct+r.wrong))*100).toFixed(1) : 0,
    Observacoes: r.notes || ''
  }));

  const wsTopics = XLSX.utils.json_to_sheet(topicsSheet.length?topicsSheet:[{Info:'Nenhum tópico cadastrado'}]);
  const wsReviews = XLSX.utils.json_to_sheet(reviewsSheet.length?reviewsSheet:[{Info:'Nenhuma revisão registrada'}]);

  XLSX.utils.book_append_sheet(wb, wsTopics, 'Tópicos');
  XLSX.utils.book_append_sheet(wb, wsReviews, 'Revisões');

  XLSX.writeFile(wb, 'revisao_ativa_dados.xlsx');
  toast('XLSX exportado!');
});

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('btnImportJson').addEventListener('click', ()=>{
  const file = document.getElementById('importFile').files[0];
  if(!file){ toast('Selecione um arquivo JSON.'); return; }
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const imported = JSON.parse(e.target.result);
      if(!imported.topics || !imported.reviews) throw new Error('Formato inválido');
      state = imported;
      saveData();
      renderAll();
      toast('Dados importados com sucesso!');
    }catch(err){
      toast('Arquivo inválido.');
    }
  };
  reader.readAsText(file);
});

document.getElementById('btnResetAll').addEventListener('click', ()=>{
  if(!confirm('Tem certeza? Isso apagará TODOS os tópicos e revisões permanentemente.')) return;
  state = {topics:[], reviews:[]};
  saveData();
  renderAll();
  toast('Todos os dados foram apagados.');
});

/* ---------------- INIT ---------------- */
function renderAll(){
  renderTopics();
  renderReviewTopicOptions();
  renderHistory();
  renderDashboard();
  renderSchedule();
}
renderAll();