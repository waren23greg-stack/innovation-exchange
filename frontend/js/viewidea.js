const API   = 'https://innovation-exchange.onrender.com/api';
const token = localStorage.getItem('accessToken');
const ideaId = new URLSearchParams(window.location.search).get('id');

if (!token) window.location.href = 'auth.html';
if (!ideaId) window.location.href = 'browse-ideas.html';

async function loadIdea() {
  try {
    const res  = await fetch(`${API}/ideas/${ideaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) { window.location.href = 'auth.html'; return; }
    const data = await res.json();
    renderIdea(data.idea);
  } catch(err) {
    document.getElementById('ideaTitle').textContent = 'Error: ' + err.message;
  }
}

function renderIdea(idea) {
  document.getElementById('ideaTitle').textContent = idea.title;
  document.getElementById('ideaDescription').textContent =
    `Category: ${idea.category || '—'} | Score: ${idea.innovation_score || '—'}/100 | Status: ${idea.status}`;

  const container = document.getElementById('layersContainer');
  container.innerHTML = '';

  if (!idea.layers || idea.layers.length === 0) {
    container.innerHTML = '<p style="color:#6b7f96">No layers yet.</p>';
    return;
  }

  idea.layers.forEach(layer => {
    const div = document.createElement('div');
    div.style.cssText = 'background:rgba(13,21,37,0.7);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:16px;margin-bottom:12px;';

    const canAccess = layer.can_access;
    const conditions = layer.unlock_conditions || {};

    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${canAccess ? '12px' : '0'}">
        <strong style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#00d4b1">
          Layer ${layer.layer_number} — ${layer.layer_name}
        </strong>
        <span style="font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 8px;border-radius:20px;
          background:${canAccess ? 'rgba(61,214,140,0.1)' : 'rgba(255,255,255,0.05)'};
          border:1px solid ${canAccess ? 'rgba(61,214,140,0.2)' : 'rgba(255,255,255,0.1)'};
          color:${canAccess ? '#3dd68c' : '#6b7f96'}">
          ${canAccess ? 'UNLOCKED' : 'LOCKED'}
        </span>
      </div>
      ${canAccess && layer.content
        ? `<div style="font-size:13px;line-height:1.7;color:#a8bfd4;padding:12px;background:rgba(0,0,0,0.2);border-radius:6px;user-select:none;">${layer.content}</div>`
        : !canAccess
        ? `<div style="margin-top:12px">
            ${conditions.nda_required
              ? `<button onclick="sendNDA(${layer.layer_number})" style="background:#f0a830;color:#080d18;border:none;padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">Sign NDA to Unlock</button>`
              : conditions.escrow_amount_usd
              ? `<button onclick="depositEscrow(${layer.layer_number},${conditions.escrow_amount_usd})" style="background:#4da6ff;color:#080d18;border:none;padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">Deposit $${conditions.escrow_amount_usd} Escrow</button>`
              : `<button onclick="unlockLayer(${layer.layer_number})" style="background:#00d4b1;color:#080d18;border:none;padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">Unlock Layer</button>`
            }
          </div>`
        : ''
      }
    `;
    container.appendChild(div);
  });
}

async function unlockLayer(layerNumber) {
  try {
    const res  = await fetch(`${API}/ideas/${ideaId}/layers/${layerNumber}/unlock`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.layer) { alert('Layer unlocked!'); loadIdea(); }
    else alert(data.error || 'Unlock failed');
  } catch(err) { alert('Error: ' + err.message); }
}

async function sendNDA(layerNumber) {
  const email = prompt('Your email for NDA:');
  const name  = prompt('Your full name:');
  if (!email || !name) return;
  try {
    const res  = await fetch(`${API}/ideas/${ideaId}/nda`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewer_email: email, viewer_name: name })
    });
    const data = await res.json();
    alert(`NDA sent! Envelope ID: ${data.envelope_id}\nOnce signed, use this ID to unlock the layer.`);
  } catch(err) { alert('Error: ' + err.message); }
}

async function depositEscrow(layerNumber, amount) {
  if (!confirm(`Deposit $${amount} escrow to access Layer ${layerNumber}?`)) return;
  try {
    const res  = await fetch(`${API}/ideas/${ideaId}/escrow`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ layer_number: layerNumber, amount_usd: amount })
    });
    const data = await res.json();
    if (data.payment_ref) { alert(`Escrow deposited! Ref: ${data.payment_ref}`); loadIdea(); }
    else alert(data.error || 'Escrow failed');
  } catch(err) { alert('Error: ' + err.message); }
}

loadIdea();
