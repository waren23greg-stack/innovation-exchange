const urlParams = new URLSearchParams(window.location.search);
const ideaId = urlParams.get('id');
const token = localStorage.getItem('token');

const ideaTitleEl = document.getElementById('ideaTitle');
const ideaDescriptionEl = document.getElementById('ideaDescription');
const layersContainer = document.getElementById('layersContainer');
const filterButtons = document.querySelectorAll('.filters button');

// Modal elements
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalText = document.getElementById('modalText');
const recipientInput = document.getElementById('recipientId');
const modalConfirm = document.getElementById('modalConfirm');
const modalClose = document.getElementById('modalClose');

let allLayers = [];
let selectedLayerId = null;

// Close modal
modalClose.addEventListener('click', () => modal.style.display = 'none');
window.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

// Fetch idea & layers
(async () => {
  try {
    const res = await fetch(`http://localhost:5000/api/ideas/browse`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const idea = data.ideas.find(i => i.id == ideaId);
    if (!idea) throw new Error('Idea not found');

    ideaTitleEl.textContent = idea.title;
    ideaDescriptionEl.textContent = idea.description;

    // Fetch accessible layers
    const layersRes = await fetch(`http://localhost:5000/api/ideas/${ideaId}/layers`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const layersData = await layersRes.json();
    allLayers = layersData.layers.map(l => ({ ...l, unlocked: l.access_conditions !== 'paid' })); // unlock public/owner layers

    renderLayers('all');
  } catch (err) {
    ideaTitleEl.textContent = 'Error loading idea';
    ideaDescriptionEl.textContent = err.message;
  }
})();

// Render layers
function renderLayers(filterType) {
  layersContainer.innerHTML = '';
  allLayers.forEach(layer => {
    if(filterType !== 'all' && layer.access_conditions !== filterType) return;

    const layerDiv = document.createElement('div');
    layerDiv.classList.add('layer');

    const contentHTML = layer.unlocked ? layer.content : '<em>Locked Layer - Purchase to Unlock</em>';

    layerDiv.innerHTML = `
      <div class="layer-header">
        <strong>Layer ${layer.layer_number} (${layer.access_conditions})</strong>
        ${layer.access_conditions === 'owner' || !layer.unlocked ? 
          '<button class="btn-action">Transfer / Buy</button>' : ''}
      </div>
      <div class="layer-content">${contentHTML}</div>
    `;

    const header = layerDiv.querySelector('.layer-header');
    header.addEventListener('click', e => {
      if(e.target.classList.contains('btn-action')) return;
      if(layer.access_conditions === 'paid' && !layer.unlocked) return; // locked
      layerDiv.classList.toggle('open');
    });

    // Modal trigger
    const actionBtn = layerDiv.querySelector('.btn-action');
    if(actionBtn){
      actionBtn.addEventListener('click', () => {
        selectedLayerId = layer.layer_number;
        modal.style.display = 'flex';
        modalTitle.textContent = layer.access_conditions === 'owner' ? 'Transfer Ownership' : 'Purchase Layer';
        modalText.textContent = `You are about to ${layer.access_conditions === 'owner' ? 'transfer' : 'purchase'} Layer ${layer.layer_number}.`;
        recipientInput.value = '';
      });
    }

    layersContainer.appendChild(layerDiv);
  });
}

// Filter button events
filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderLayers(btn.getAttribute('data-type'));
  });
});

// Confirm modal action
modalConfirm.addEventListener('click', async () => {
  const toUserId = recipientInput.value;
  if(!toUserId){ alert('Please enter recipient User ID'); return; }

  try{
    const res = await fetch(`http://localhost:5000/api/ideas/${ideaId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ layerNumber: selectedLayerId, toUserId })
    });
    const data = await res.json();
    if(data.result){
      alert('Action successful!');
      // Unlock layer if it was paid
      const layer = allLayers.find(l => l.layer_number === selectedLayerId);
      if(layer.access_conditions === 'paid') layer.unlocked = true;
      renderLayers('all');
    } else {
      alert(data.error);
    }
  } catch(err){
    alert('Error: ' + err.message);
  }
  modal.style.display = 'none';
});