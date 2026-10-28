import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LaundryService, setLiveModeForTesting } from '../services/laundryService';
import { supabase } from '../services/supabase';
import { Order } from '../types';

describe('Stage 5B: Frontend Secure RPC Integration & Fail-Closed Security Verification', () => {
  const baseOrder: Order = {
    id: '11111111-1111-4111-a111-111111111111',
    order_number: 'SW-5001',
    customer_id: 'cust-uuid-001',
    customer_name: 'Test Customer',
    customer_phone: '9876543210',
    pickup_address: '123 Test St',
    pickup_pincode: '560038',
    pickup_date: '2026-10-30',
    pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
    order_status: 'collected',
    payment_status: 'pending',
    payment_method: 'cash',
    price_per_kg_paise: 8000,
    min_weight_kg: 1.0,
    delivery_charge_paise: 0,
    paid_amount_paise: 0,
    notes: 'Multi-service booking [Linked Batch BATCH-TEST: Wash & Fold (1/2)]',
    created_at: '2026-10-28T10:00:00Z',
    updated_at: '2026-10-28T10:00:00Z'
  };

  let mockDbOrders: Order[] = [];
  let updateSpy: any;

  beforeEach(async () => {
    localStorage.clear();
    LaundryService.resetOrderSequence();
    vi.restoreAllMocks();
    setLiveModeForTesting(true);

    mockDbOrders = [{ ...baseOrder }];

    updateSpy = vi.fn().mockImplementation((payload: any) => ({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ ...mockDbOrders[0], ...payload }],
          error: null
        })
      })
    }));

    const queryBuilderMock: any = {
      select: vi.fn().mockImplementation(() => ({
        order: vi.fn().mockResolvedValue({ data: mockDbOrders, error: null }),
        like: vi.fn().mockResolvedValue({ data: mockDbOrders, error: null }),
        eq: vi.fn().mockResolvedValue({ data: mockDbOrders, error: null }),
        single: vi.fn().mockResolvedValue({ data: mockDbOrders[0], error: null }),
        then: (resolve: any) => resolve({ data: mockDbOrders, error: null })
      })),
      update: updateSpy,
      insert: vi.fn().mockResolvedValue({ data: null, error: null })
    };

    vi.spyOn(supabase, 'from').mockReturnValue(queryBuilderMock);
  });

  afterEach(() => {
    setLiveModeForTesting(false);
  });

  it('1. verifies record_store_intake_weight RPC invocation and return reconciliation', async () => {
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: baseOrder.id,
        measured_weight: 3.5,
        billable_weight: 3.5,
        discount_paise: 2000,
        total_amount_paise: 26000,
        order_status: 'washing'
      },
      error: null
    } as any);

    const updated = await LaundryService.enterMeasuredWeight(
      baseOrder.id,
      3.5,
      'Store Manager',
      'Initial intake weight'
    );

    expect(rpcSpy).toHaveBeenCalledWith('record_store_intake_weight', {
      p_order_id: baseOrder.id,
      p_measured_weight: 3.5,
      p_correction_reason: 'Initial intake weight'
    });

    expect(updated.measured_weight).toBe(3.5);
    expect(updated.billable_weight).toBe(3.5);
    expect(updated.discount_paise).toBe(2000);
    expect(updated.total_amount_paise).toBe(26000);
  });

  it('2. verifies fail-closed behavior when record_store_intake_weight RPC fails or is unavailable', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.record_store_intake_weight in schema cache'
      }
    } as any);

    await expect(
      LaundryService.enterMeasuredWeight(baseOrder.id, 4.0, 'Store Manager', 'Weight check')
    ).rejects.toThrow('The store intake scale service is temporarily unavailable while database upgrades are pending.');

    // Verifies no direct update was attempted on public.orders table
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('3. verifies record_courier_pickup_collection RPC invocation and return reconciliation', async () => {
    mockDbOrders[0] = {
      ...baseOrder,
      order_status: 'pickup_assigned',
      assigned_pickup_id: '00000000-0000-4000-a000-000000000002'
    };

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: baseOrder.id,
        measured_weight: 2.5,
        billable_weight: 2.5,
        discount_paise: 0,
        total_amount_paise: 20000,
        order_status: 'collected'
      },
      error: null
    } as any);

    const updated = await LaundryService.recordPickupCollectionAndWeight(
      baseOrder.id,
      2.5,
      '00000000-0000-4000-a000-000000000002',
      'Ravi Courier',
      'Doorstep scale reading: 2.5 kg'
    );

    expect(rpcSpy).toHaveBeenCalledWith('record_courier_pickup_collection', {
      p_order_id: baseOrder.id,
      p_measured_weight: 2.5,
      p_delivery_notes: 'Doorstep scale reading: 2.5 kg'
    });

    expect(updated.order_status).toBe('collected');
    expect(updated.measured_weight).toBe(2.5);
    expect(updated.total_amount_paise).toBe(20000);
  });

  it('4. verifies fail-closed behavior when record_courier_pickup_collection RPC is unavailable', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: {
        code: '42883',
        message: 'function record_courier_pickup_collection does not exist'
      }
    } as any);

    await expect(
      LaundryService.recordPickupCollectionAndWeight(baseOrder.id, 2.5)
    ).rejects.toThrow('The doorstep collection service is temporarily unavailable while database upgrades are pending.');

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('5. verifies cancel_order_with_batch_sync RPC invocation on cancellation', async () => {
    mockDbOrders[0] = {
      ...baseOrder,
      order_status: 'booked'
    };

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: baseOrder.id,
        order_status: 'cancelled',
        cancellation_reason: 'Customer travelling out of city'
      },
      error: null
    } as any);

    const updated = await LaundryService.cancelOrder(
      baseOrder.id,
      'Customer travelling out of city'
    );

    expect(rpcSpy).toHaveBeenCalledWith('cancel_order_with_batch_sync', {
      p_order_id: baseOrder.id,
      p_cancellation_reason: 'Customer travelling out of city'
    });

    expect(updated.order_status).toBe('cancelled');
    expect(updated.cancellation_reason).toBe('Customer travelling out of city');
  });

  it('6. verifies fail-closed cancellation: never allows direct write bypassing batch coupon recalculation', async () => {
    mockDbOrders[0] = {
      ...baseOrder,
      order_status: 'booked'
    };

    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.cancel_order_with_batch_sync'
      }
    } as any);

    await expect(
      LaundryService.cancelOrder(baseOrder.id, 'Customer cancellation')
    ).rejects.toThrow('The order cancellation service is temporarily unavailable while database upgrades are pending.');

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('7. verifies advance_order_workflow_status RPC invocation for workflow transitions', async () => {
    mockDbOrders[0] = {
      ...baseOrder,
      order_status: 'washing',
      measured_weight: 3.0,
      billable_weight: 3.0,
      total_amount_paise: 24000
    };

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: baseOrder.id,
        previous_status: 'washing',
        order_status: 'ready_for_delivery',
        notes: 'Clothes packed and ready'
      },
      error: null
    } as any);

    const updated = await LaundryService.updateOrderStatus(
      baseOrder.id,
      'ready_for_delivery',
      'Clothes packed and ready'
    );

    expect(rpcSpy).toHaveBeenCalledWith('advance_order_workflow_status', {
      p_order_id: baseOrder.id,
      p_target_status: 'ready_for_delivery',
      p_notes: 'Clothes packed and ready'
    });

    expect(updated.order_status).toBe('ready_for_delivery');
  });

  it('8. verifies fail-closed workflow transition on RPC unavailability', async () => {
    mockDbOrders[0] = {
      ...baseOrder,
      order_status: 'washing',
      measured_weight: 3.0,
      billable_weight: 3.0,
      total_amount_paise: 24000
    };

    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.advance_order_workflow_status'
      }
    } as any);

    await expect(
      LaundryService.updateOrderStatus(baseOrder.id, 'ready_for_delivery', 'Ready note')
    ).rejects.toThrow('The order workflow service is temporarily unavailable while database upgrades are pending.');

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('9. verifies assign_order_courier RPC invocation and fail-closed behavior for courier assignments', async () => {
    mockDbOrders[0] = {
      ...baseOrder,
      order_status: 'booked'
    };

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: baseOrder.id,
        order_status: 'pickup_assigned',
        courier_name: 'Suresh Kumar',
        courier_phone: '9876543211'
      },
      error: null
    } as any);

    const updated = await LaundryService.assignPickupStaff(
      baseOrder.id,
      '00000000-0000-4000-a000-000000000001',
      'Suresh Kumar',
      '9876543211'
    );

    expect(rpcSpy).toHaveBeenCalledWith('assign_order_courier', {
      p_order_id: baseOrder.id,
      p_assignment_type: 'pickup',
      p_courier_id: '00000000-0000-4000-a000-000000000001',
      p_courier_name: 'Suresh Kumar',
      p_courier_phone: '9876543211'
    });

    expect(updated.order_status).toBe('pickup_assigned');
    expect(updated.assigned_pickup_name).toBe('Suresh Kumar');

    // Test fail-closed on RPC failure
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.assign_order_courier'
      }
    } as any);

    await expect(
      LaundryService.assignPickupStaff(baseOrder.id, '00000000-0000-4000-a000-000000000001')
    ).rejects.toThrow('The courier assignment service is temporarily unavailable while database upgrades are pending.');

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('10. verifies record_order_payment RPC invocation and fail-closed behavior', async () => {
    mockDbOrders[0] = {
      ...baseOrder,
      order_status: 'washing',
      total_amount_paise: 26000,
      paid_amount_paise: 0
    };

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        payment_id: 'payment-uuid-001',
        paid_amount_paise: 26000,
        payment_status: 'paid',
        created_at: '2026-10-28T10:15:00Z'
      },
      error: null
    } as any);

    const updated = await LaundryService.recordPayment(
      baseOrder.id,
      26000,
      'cash',
      undefined,
      'Settled in cash at pickup'
    );

    expect(rpcSpy).toHaveBeenCalledWith('record_order_payment', {
      p_order_id: baseOrder.id,
      p_amount_paise: 26000,
      p_payment_method: 'cash',
      p_transaction_reference: null,
      p_notes: 'Settled in cash at pickup',
      p_idempotency_key: null
    });

    expect(updated.paid_amount_paise).toBe(26000);
    expect(updated.payment_status).toBe('paid');

    // Reset paid amount so order has remaining balance for fail-closed test
    mockDbOrders[0].paid_amount_paise = 0;
    mockDbOrders[0].payment_status = 'pending';

    // Test fail closed on RPC error
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.record_order_payment'
      }
    } as any);

    await expect(
      LaundryService.recordPayment(baseOrder.id, 1000, 'cash')
    ).rejects.toThrow('The payment processing service is temporarily unavailable while database upgrades are pending.');

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('11. verifies update_order_delivery_notes RPC invocation with legitimate column-level fallback', async () => {
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: baseOrder.id,
        delivery_notes: 'Leave at security desk with OTP verification'
      },
      error: null
    } as any);

    const updated = await LaundryService.updateDeliveryNotes(
      baseOrder.id,
      'Leave at security desk with OTP verification'
    );

    expect(rpcSpy).toHaveBeenCalledWith('update_order_delivery_notes', {
      p_order_id: baseOrder.id,
      p_delivery_notes: 'Leave at security desk with OTP verification'
    });

    expect(updated.delivery_notes).toBe('Leave at security desk with OTP verification');

    // Test legitimate column-level fallback when RPC is unavailable (granted in DB catalog)
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.update_order_delivery_notes'
      }
    } as any);

    const fallbackUpdated = await LaundryService.updateDeliveryNotes(
      baseOrder.id,
      'Fallback column-level update allowed'
    );

    expect(fallbackUpdated.delivery_notes).toBe('Fallback column-level update allowed');
    expect(updateSpy).toHaveBeenCalledWith({
      delivery_notes: 'Fallback column-level update allowed',
      updated_at: expect.any(String)
    });
  });
});
