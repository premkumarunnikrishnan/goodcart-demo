const list=document.getElementById('orders-list');
const money=value=>'$'+Number(value).toFixed(2);
const safe=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
async function loadOrders(){
  try{
    const response=await fetch('/api/orders');
    if(!response.ok)throw new Error('Could not load orders.');
    const orders=await response.json();
    list.innerHTML=orders.length?orders.map(order=>`<article class="order-card"><div class="order-card-head"><div><strong>${safe(order.id)}</strong><span>${new Date(order.createdAt).toLocaleString()}</span></div><label>Status <select data-order="${safe(order.id)}" aria-label="Status for order ${safe(order.id)}">${['New','Processing','Completed'].map(status=>`<option value="${status}" ${order.status===status?'selected':''}>${status}</option>`).join('')}</select></label></div><div class="order-card-body"><div><b>${safe(order.customer.firstName)} ${safe(order.customer.lastName)}</b><p>${safe(order.customer.email)}</p><p>${safe(order.customer.address)}, ${safe(order.customer.city)}, ${safe(order.customer.state)} ${safe(order.customer.zip)}</p></div><div class="order-lines">${order.items.map(item=>`<p>${safe(item.name)} × ${item.quantity} <strong>${money(item.lineTotal)}</strong></p>`).join('')}<p class="order-total">Total <strong>${money(order.total)}</strong></p></div></div></article>`).join(''):'<div class="orders-empty"><h3>No orders yet</h3><p>Orders placed at checkout will appear here.</p><a class="primary-button" href="index.html">Shop products ↗</a></div>';
  }catch(error){list.innerHTML=`<div class="orders-empty"><h3>Could not load orders</h3><p>${safe(error.message)}</p><button class="secondary-button" id="retry-orders">Try again</button></div>`;}
}
list.addEventListener('change',async event=>{
  const select=event.target.closest('[data-order]');if(!select)return;
  select.disabled=true;
  try{const response=await fetch('/api/order-status',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:select.dataset.order,status:select.value})});if(!response.ok)throw new Error('Could not update status.');}
  catch(error){alert(error.message);await loadOrders();return;}
  select.disabled=false;
});
list.addEventListener('click',event=>{if(event.target.id==='retry-orders')loadOrders();});
loadOrders();
