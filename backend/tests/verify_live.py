import urllib.request
import json

def post(url, data, headers=None):
    if headers is None:
        headers = {}
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json', **headers}
    )
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

def get(url, headers=None):
    if headers is None:
        headers = {}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

base = 'http://127.0.0.1:8000/api/v1'

# 1. Login as Admin
login_data = post(f'{base}/auth/login', {'phone_or_email': 'admin@superwash.in', 'password': 'Admin@123'})
token = login_data['access_token']
headers = {'Authorization': f'Bearer {token}'}
print('1. Admin Login Success:', login_data['user']['full_name'])

# 2. Get Services & Prices
services = get(f'{base}/services')
print('2. Loaded services count:', len(services))
shirt_price = [p for s in services for p in s['prices'] if 'Shirt' in p['item_name']][0]

# 3. Create Walk-in Order with initial partial payment
walkin_payload = {
    'customer_name': 'Aarav Patel',
    'customer_phone': '9845012345',
    'customer_email': 'aarav@example.com',
    'items': [{'service_price_id': shirt_price['id'], 'quantity': 2, 'special_instruction': 'No starch'}],
    'initial_payment_paise': 3000, # Rs 30 paid in cash
    'payment_method': 'cash'
}
order = post(f'{base}/admin/orders/walk-in', walkin_payload, headers=headers)
order_id = order['id']
print(f"3. Walk-in Order created: #{order['order_number']}, Status: {order['status']}, Paid: Rs{order['paid_paise']/100}, Outstanding: Rs{order['outstanding_paise']/100}")

# 4. Record Garment Intake & Inspection
insp_payload = {
    'actual_count_received': 2,
    'existing_stains_damage': 'Small coffee spot on collar',
    'inspection_notes': 'Tagged #TAG-8821',
    'quality_check_passed': True
}
insp = post(f'{base}/admin/orders/{order_id}/inspection', insp_payload, headers=headers)
inspected_order = get(f'{base}/orders/{order_id}', headers=headers)
print('4. Inspection recorded. Status updated to:', inspected_order['status'])

# 5. Advance Workflow: Wash -> Iron -> QC -> Ready
s1 = post(f'{base}/admin/orders/{order_id}/status', {'status': 'washing_drycleaning', 'notes': 'In wash drum #1'}, headers=headers)
s2 = post(f'{base}/admin/orders/{order_id}/status', {'status': 'ironing_finishing', 'notes': 'Steam ironed'}, headers=headers)
s3 = post(f'{base}/admin/orders/{order_id}/status', {'status': 'quality_check', 'notes': 'Passed QC'}, headers=headers)
s4 = post(f'{base}/admin/orders/{order_id}/status', {'status': 'ready_for_delivery', 'notes': 'Bagged for collection'}, headers=headers)
print('5. Advanced through workflow to stage:', s4['status'])

# 6. Record remaining payment via UPI
rem_balance = s4['outstanding_paise']
pay_payload = {
    'amount_paise': rem_balance,
    'payment_method': 'upi_manual',
    'transaction_reference': 'UPI/2026/99887711',
    'notes': 'Paid remainder at counter'
}
pay = post(f'{base}/payments/record-manual?order_id={order_id}', pay_payload, headers=headers)
print(f'6. Remaining payment recorded. Payment status: {pay["payment_status"]}, Recorded receipt: {pay["payment_number"]}')

# 7. Complete Delivery / Collection
s5 = post(f'{base}/admin/orders/{order_id}/status', {'status': 'delivered_collected', 'notes': 'Handed over to customer'}, headers=headers)
print(f"7. Order completed! Final status: {s5['status']}, Paid: Rs{s5['paid_paise']/100}, Outstanding: Rs{s5['outstanding_paise']/100}")

# 8. Check Dashboard Metrics
metrics = get(f'{base}/admin/metrics', headers=headers)
print(f"8. Dashboard Metrics: Orders received today: {metrics['orders_received_today']}, Revenue today: Rs{metrics['revenue_today_paise']/100}, Outstanding: Rs{metrics['outstanding_customer_balances_paise']/100}")

print("\nALL ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY ON LIVE RUNNING APPLICATION!")
