const form = document.getElementById('status-form');
const orderId = document.getElementById('order-id');
const statusSelect = document.getElementById('order-status');
const feedback = document.getElementById('admin-feedback');
const submit = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async event => {
  event.preventDefault();
  const id = orderId.value.trim().toUpperCase();
  feedback.classList.remove('error');
  if (!/^GC-[A-F0-9]{8}$/.test(id)) {
    feedback.textContent = 'Enter a valid order ID, such as GC-1234ABCD.';
    feedback.classList.add('error');
    return;
  }

  submit.disabled = true;
  feedback.textContent = '';
  try {
    const response = await fetch('/api/order-status', {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({id, status: statusSelect.value})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not update status.');
    orderId.value = result.id;
    feedback.textContent = 'Order ' + result.id + ' is now ' + result.status + '.';
  } catch (error) {
    feedback.textContent = error.message || 'Could not update status.';
    feedback.classList.add('error');
  } finally {
    submit.disabled = false;
  }
});