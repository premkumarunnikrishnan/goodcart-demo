const list=document.getElementById('orders-list');
const feedback=document.getElementById('orders-feedback');
const money=value=>'$'+Number(value).toFixed(2);
const safe=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cleanupKey=id=>`goodcart-test-cleanup:${id}`;
async function loadOrders(){
  try{
    const response=await fetch('/api/orders');
    if(!response.ok)throw new Error('Could not load orders.');
    const orders=await response.json();
    list.innerHTML=orders.length?orders.map(order=>`<article class="order-card"><div class="order-card-head"><div><strong>${safe(order.id)}</strong><span>${new Date(order.createdAt).toLocaleString()}</span></div><span class="order-status">Status <strong>${safe(order.status === 'New' ? 'Processing' : order.status)}</strong></span></div><div class="order-card-body"><div><b>${safe(order.customer.firstName)} ${safe(order.customer.lastName)}</b><p>${safe(order.customer.email)}</p><p>${safe(order.customer.address)}, ${safe(order.customer.city)}, ${safe(order.customer.state)} ${safe(order.customer.zip)}</p></div><div class="order-lines">${order.items.map(item=>`<p>${safe(item.name)} × ${item.quantity} <strong>${money(item.lineTotal)}</strong></p>`).join('')}<p class="order-total">Total <strong>${money(order.total)}</strong></p></div></div>${sessionStorage.getItem(cleanupKey(order.id))?`<button class="secondary-button test-order-cleanup" data-cleanup="${safe(order.id)}">Delete demo order</button>`:''}</article>`).join(''):'<div class="orders-empty"><h3>No orders yet</h3><p>Orders placed at checkout will appear here.</p><a class="primary-button" href="index.html">Shop products ↗</a></div>';
  }catch(error){list.innerHTML=`<div class="orders-empty"><h3>Could not load orders</h3><p>${safe(error.message)}</p><button class="secondary-button" id="retry-orders">Try again</button></div>`;}
}
list.addEventListener('click',async event=>{
  if(event.target.id==='retry-orders'){loadOrders();return;}
  const button=event.target.closest('[data-cleanup]');
  if(!button)return;
  const id=button.dataset.cleanup;
  const token=sessionStorage.getItem(cleanupKey(id));
  if(!token)return;
  button.disabled=true;
  feedback.textContent='';
  try{
    const response=await fetch('/api/order-cleanup',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id,token})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Could not delete test order.');
    sessionStorage.removeItem(cleanupKey(id));
    await loadOrders();
    feedback.textContent='Test order deleted.';
  }catch(error){feedback.textContent=error.message||'Could not delete test order.';button.disabled=false;}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadOrders();});
window.addEventListener('pageshow',event=>{if(event.persisted)loadOrders();});
loadOrders();
