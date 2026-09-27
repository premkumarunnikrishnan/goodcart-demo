const products = [
  {id:1,name:'Everyday Ceramic Mug',category:'Home',price:24,rating:4.9,reviews:128,emoji:'☕',color:'#f1e7dc',badge:'BESTSELLER',description:'A beautifully simple ceramic mug made for slow mornings and your favorite warm drink.',features:['Comfortable, easy-to-hold handle','Dishwasher and microwave safe','Holds 12 oz']},
  {id:2,name:'Cloud Soft Throw',category:'Home',price:49,rating:4.8,reviews:94,emoji:'🧶',color:'#e5ece7',badge:'NEW',description:'A soft, cozy throw that brings instant comfort to your sofa or bed.',features:['Generously sized for lounging','Easy-care fabric','Soft, textured finish']},
  {id:3,name:'Daily Carry Tote',category:'Lifestyle',price:32,rating:4.9,reviews:76,emoji:'👜',color:'#eee8dc',badge:'',description:'Your go-everywhere companion, with room for errands, books, and everyday essentials.',features:['Roomy interior','Comfortable shoulder straps','Lightweight everyday design']},
  {id:4,name:'Wireless Headphones',category:'Tech',price:89,rating:4.7,reviews:213,emoji:'🎧',color:'#e5ebee',badge:'POPULAR',description:'Settle into your favorite playlist with comfortable wireless listening.',features:['Up to 24 hours of listening','Soft cushioned ear cups','Bluetooth connectivity']},
  {id:5,name:'Minimal Desk Lamp',category:'Home',price:68,rating:4.8,reviews:52,emoji:'💡',color:'#ecebe6',badge:'',description:'A clean, warm glow that makes your desk feel like your favorite place to be.',features:['Adjustable light direction','Warm, focused light','Compact footprint']},
  {id:6,name:'Hydration Bottle',category:'Lifestyle',price:28,rating:4.6,reviews:161,emoji:'🧴',color:'#e3edea',badge:'',description:'Keep your favorite drink close at hand, wherever the day takes you.',features:['Reusable everyday essential','Easy-grip shape','Leak-resistant lid']},
  {id:7,name:'Portable Speaker',category:'Tech',price:59,rating:4.8,reviews:137,emoji:'🔊',color:'#e8e9ef',badge:'',description:'Small enough to take along, with rich sound for every moment.',features:['Wireless Bluetooth pairing','Compact, portable design','Rechargeable battery']},
  {id:8,name:'Fresh Start Notebook',category:'Office',price:18,rating:4.9,reviews:84,emoji:'📓',color:'#ede8df',badge:'BESTSELLER',description:'A lovely place for ideas, plans, sketches, and everything worth writing down.',features:['Smooth lined pages','Durable hardcover','Lay-flat binding']},
  {id:9,name:'Modern Planter',category:'Home',price:35,rating:4.7,reviews:61,emoji:'🪴',color:'#e5ede0',badge:'',description:'Give your favorite greenery a fresh home with this understated planter.',features:['Clean contemporary shape','Fits most small houseplants','Protective base included']},
  {id:10,name:'Weekend Sunglasses',category:'Lifestyle',price:42,rating:4.6,reviews:89,emoji:'🕶️',color:'#f1e9df',badge:'',description:'An easy finishing touch for sunny days out and laid-back weekends.',features:['Lightweight frame','UV protection','Includes soft storage pouch']},
  {id:11,name:'Desktop Organizer',category:'Office',price:26,rating:4.8,reviews:73,emoji:'🗂️',color:'#e8ece6',badge:'',description:'A tidy little home for the tools and notes you reach for every day.',features:['Multiple compartments','Space-saving design','Easy to wipe clean']},
  {id:12,name:'Cozy Reading Light',category:'Tech',price:22,rating:4.7,reviews:105,emoji:'📖',color:'#ece8ee',badge:'',description:'A gentle, adjustable light for one more chapter, wherever you settle in.',features:['Adjustable brightness','Flexible neck','USB rechargeable']}
];

const $ = id => document.getElementById(id);
const money = n => '$' + n.toFixed(2);
const storageKey = 'goodcart-cart-v1';
let cart = {};
try { cart = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { cart = {}; }
let category = 'All products';
let query = '';
let sort = 'featured';
let activeModal = null;
let previousFocus = null;
let toastTimer;

function saveCart(){localStorage.setItem(storageKey,JSON.stringify(cart));updateCartCount();renderCart();}
function cartEntries(){return Object.entries(cart).map(([id,qty])=>({product:products.find(p=>p.id===Number(id)),qty})).filter(x=>x.product&&x.qty>0);}
function totals(){const subtotal=cartEntries().reduce((sum,{product,qty})=>sum+product.price*qty,0);return{subtotal,shipping:subtotal>=75||subtotal===0?0:7.95,total:subtotal+(subtotal>=75||subtotal===0?0:7.95)};}
function updateCartCount(){const count=Object.values(cart).reduce((a,b)=>a+b,0);$('cart-count').textContent=count;$('cart-heading-count').textContent=`(${count})`;}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
function addToCart(id){cart[id]=(cart[id]||0)+1;saveCart();toast('Added to your cart');}
function changeQuantity(id,delta){const next=(cart[id]||0)+delta;if(next<=0)delete cart[id];else cart[id]=next;saveCart();}
function openLayer(name){previousFocus=document.activeElement;activeModal=name;$('overlay').hidden=false;const el=$(name);el.classList.add('open');el.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';el.querySelector('button')?.focus();}
function closeLayer(){if(!activeModal)return;const el=$(activeModal);el.classList.remove('open');el.setAttribute('aria-hidden','true');$('overlay').hidden=true;document.body.style.overflow='';activeModal=null;previousFocus?.focus();}
function switchLayer(name){closeLayer();openLayer(name);}

function renderFilters(){const categories=['All products','Home','Lifestyle','Tech','Office'];$('filters').innerHTML=categories.map(c=>`<button class="filter ${c===category?'active':''}" data-category="${c}" aria-pressed="${c===category}">${c}</button>`).join('');}
function renderProducts(){let list=products.filter(p=>(category==='All products'||p.category===category)&&(`${p.name} ${p.category} ${p.description}`.toLowerCase().includes(query)));if(sort==='price-low')list.sort((a,b)=>a.price-b.price);if(sort==='price-high')list.sort((a,b)=>b.price-a.price);if(sort==='rating')list.sort((a,b)=>b.rating-a.rating||b.reviews-a.reviews);$('result-line').textContent=`Showing ${list.length} ${list.length===1?'product':'products'}`;$('empty-results').hidden=list.length>0;$('product-grid').innerHTML=list.map(p=>`<article class="product-card"><div class="product-image" style="background:${p.color}" role="button" tabindex="0" aria-label="View ${p.name}" data-detail="${p.id}">${p.badge?`<span class="badge">${p.badge}</span>`:''}<span class="product-emoji" aria-hidden="true">${p.emoji}</span><button class="quick-add" data-add="${p.id}" aria-label="Add ${p.name} to cart">+</button></div><div class="product-info"><span class="product-category">${p.category}</span><button class="product-name" data-detail="${p.id}">${p.name}</button><div class="rating">★★★★★ <span>${p.rating} (${p.reviews})</span></div><div class="price">${money(p.price)}</div></div></article>`).join('');}
function renderCart(){const entries=cartEntries();const {subtotal,shipping}=totals();$('cart-items').innerHTML=entries.length?entries.map(({product:p,qty})=>`<div class="cart-item"><div class="cart-thumb" style="background:${p.color}" aria-hidden="true">${p.emoji}</div><div class="cart-item-main"><div class="cart-item-top"><span class="cart-item-title">${p.name}</span><span class="cart-item-price">${money(p.price*qty)}</span></div><small>${p.category}</small><div class="cart-controls"><div class="quantity-control"><button data-qty="${p.id}" data-delta="-1" aria-label="Remove one ${p.name}">−</button><span>${qty}</span><button data-qty="${p.id}" data-delta="1" aria-label="Add one ${p.name}">+</button></div><button class="remove-button" data-remove="${p.id}">Remove</button></div></div></div>`).join(''):`<div class="cart-empty"><div class="empty-icon">♧</div><h3>Your cart is empty</h3><p>There are good things waiting to be discovered.</p><button class="secondary-button" id="continue-shopping">Continue shopping</button></div>`;$('cart-footer').innerHTML=entries.length?`<div class="summary-row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div><div class="summary-row"><span>Shipping</span><span>${shipping?money(shipping):'Free'}</span></div><p class="shipping-note">${shipping?`${money(75-subtotal)} away from free shipping`:'You unlocked free shipping!'}</p><button class="primary-button" id="checkout-button">Review & checkout <span>↗</span></button>`:'';}
function renderDetail(id){const p=products.find(x=>x.id===id);if(!p)return;$('detail-content').innerHTML=`<div class="detail-layout"><div class="detail-image" style="background:${p.color}"><span aria-hidden="true">${p.emoji}</span></div><div class="detail-info"><span class="eyebrow">${p.category.toUpperCase()}</span><h2>${p.name}</h2><div class="detail-rating">★★★★★ <span>${p.rating} · ${p.reviews} reviews</span></div><div class="detail-price">${money(p.price)}</div><p class="detail-description">${p.description}</p>${p.features.map(f=>`<p class="detail-feature">${f}</p>`).join('')}<button class="primary-button" data-add="${p.id}">Add to cart <span>↗</span></button></div></div>`;openLayer('detail-modal');}
function renderCheckout(){const entries=cartEntries();if(!entries.length)return;const {subtotal,shipping,total}=totals();$('checkout-content').innerHTML=`<div class="checkout-body"><form class="checkout-form" id="checkout-form"><h3>Contact & delivery</h3><div class="field-grid"><div class="field full"><label for="email">Email address</label><input id="email" type="email" autocomplete="email" required placeholder="you@example.com"></div><div class="field"><label for="first-name">First name</label><input id="first-name" autocomplete="given-name" required></div><div class="field"><label for="last-name">Last name</label><input id="last-name" autocomplete="family-name" required></div><div class="field full"><label for="address">Street address</label><input id="address" autocomplete="street-address" required></div><div class="field"><label for="city">City</label><input id="city" autocomplete="address-level2" required></div><div class="field"><label for="state">State</label><input id="state" autocomplete="address-level1" required></div><div class="field"><label for="zip">ZIP code</label><input id="zip" autocomplete="postal-code" inputmode="numeric" required></div></div><div class="form-section"><h3>Dummy payment</h3><p class="payment-note">Demo checkout only. No real payment is processed or card details stored.</p><div class="field-grid"><div class="field full"><label for="card-name">Name on card</label><input id="card-name" autocomplete="cc-name" required></div><div class="field full"><label for="card-number">Card number</label><input id="card-number" inputmode="numeric" pattern="[0-9 ]{13,23}" maxlength="23" placeholder="4242 4242 4242 4242" required></div><div class="field"><label for="expiry">Expiry (MM/YY)</label><input id="expiry" inputmode="numeric" pattern="(0[1-9]|1[0-2])/[0-9]{2}" maxlength="5" placeholder="12/28" required></div><div class="field"><label for="cvv">CVV</label><input id="cvv" inputmode="numeric" pattern="[0-9]{3,4}" maxlength="4" placeholder="123" required></div></div></div><button class="primary-button" type="submit">Place demo order · ${money(total)} <span>↗</span></button></form><div class="checkout-summary"><h3>Order summary</h3>${entries.map(({product:p,qty})=>`<div class="checkout-item"><span>${p.emoji} &nbsp; ${p.name} × ${qty}</span><strong>${money(p.price*qty)}</strong></div>`).join('')}<div class="checkout-totals"><div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div><div class="summary-row"><span>Shipping</span><span>${shipping?money(shipping):'Free'}</span></div><div class="summary-row total"><span>Total</span><strong>${money(total)}</strong></div></div></div></div>`;}
async function placeOrder(event){
  event.preventDefault();
  const form=event.target;
  if(!form.reportValidity())return;
  const button=form.querySelector('[type="submit"]');
  button.disabled=true;
  button.textContent='Saving order...';
  const customer={email:$('email').value,firstName:$('first-name').value,lastName:$('last-name').value,address:$('address').value,city:$('city').value,state:$('state').value,zip:$('zip').value};
  const items=cartEntries().map(({product,qty})=>({id:product.id,quantity:qty}));
  try{
    const response=await fetch('/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer,items})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Could not save the order.');
    cart={};saveCart();
    $('checkout-content').innerHTML=`<div class="success-view"><div class="success-icon">✓</div><h3>Order placed!</h3><p>Your demo order was saved. No payment was processed and nothing will be shipped.</p><div class="order-number">Order ${result.id}</div><a class="primary-button" href="orders.html">View orders <span>↗</span></a><button class="secondary-button" id="back-to-shop" style="margin-top:12px">Back to shopping</button></div>`;
  }catch(error){toast(error.message||'Could not save the order.');button.disabled=false;button.innerHTML='Place demo order <span>↗</span>';}
}

$('filters').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;category=b.dataset.category;renderFilters();renderProducts();});
$('product-grid').addEventListener('click',e=>{const add=e.target.closest('[data-add]');if(add){addToCart(Number(add.dataset.add));return;}const detail=e.target.closest('[data-detail]');if(detail)renderDetail(Number(detail.dataset.detail));});
$('product-grid').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.product-image')){e.preventDefault();renderDetail(Number(e.target.dataset.detail));}});
$('detail-content').addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(b)addToCart(Number(b.dataset.add));});
$('cart-items').addEventListener('click',e=>{const qty=e.target.closest('[data-qty]');const remove=e.target.closest('[data-remove]');if(qty)changeQuantity(Number(qty.dataset.qty),Number(qty.dataset.delta));if(remove){delete cart[remove.dataset.remove];saveCart();}if(e.target.id==='continue-shopping')closeLayer();});
$('cart-footer').addEventListener('click',e=>{if(e.target.closest('#checkout-button')){renderCheckout();switchLayer('checkout-modal');}});
$('checkout-content').addEventListener('submit',placeOrder);
$('checkout-content').addEventListener('click',e=>{if(e.target.closest('#back-to-shop'))closeLayer();});
$('search-form').addEventListener('submit',e=>{e.preventDefault();query=$('search-input').value.trim().toLowerCase();renderProducts();$('products-section').scrollIntoView({behavior:'smooth'});});
$('search-input').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();renderProducts();});
$('sort-select').addEventListener('change',e=>{sort=e.target.value;renderProducts();});
$('clear-search').addEventListener('click',()=>{query='';category='All products';$('search-input').value='';renderFilters();renderProducts();});
$('hero-shop').addEventListener('click',()=>$('products-section').scrollIntoView({behavior:'smooth'}));
$('cart-trigger').addEventListener('click',()=>openLayer('cart-panel'));
$('close-cart').addEventListener('click',closeLayer);
$('close-detail').addEventListener('click',closeLayer);
$('close-checkout').addEventListener('click',closeLayer);
$('overlay').addEventListener('click',closeLayer);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLayer();});
renderFilters();renderProducts();updateCartCount();renderCart();
