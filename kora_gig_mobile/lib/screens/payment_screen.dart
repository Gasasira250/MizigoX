import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../models/booking.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key, required this.draft});

  final BookingDraft draft;

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  PaymentMethod _method = PaymentMethod.mtnMomo;
  bool _paying = false;

  Future<void> _pay() async {
    setState(() => _paying = true);
    await Future<void>.delayed(const Duration(milliseconds: 1100));
    if (!mounted) return;
    final app = KoraGigScope.of(context);
    final booking = app.payAndConfirm(draft: widget.draft, method: _method);
    if (!mounted) return;
    Navigator.of(context).pushNamedAndRemoveUntil(
      '/booking-success',
      (route) => route.settings.name == '/home',
      arguments: booking,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payment')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          const Text(
            'Payment Method',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          RadioGroup<PaymentMethod>(
            groupValue: _method,
            onChanged: (value) {
              if (value != null) setState(() => _method = value);
            },
            child: Column(
              children: [
                for (final method in PaymentMethod.values)
                  RadioListTile<PaymentMethod>(
                    value: method,
                    title: Text(method.label),
                    contentPadding: EdgeInsets.zero,
                  ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'Amount',
            style: TextStyle(fontSize: 16, color: AppColors.muted),
          ),
          const SizedBox(height: 4),
          Text(
            formatRwf(widget.draft.serviceFeeRwf),
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'This demo simulates the payment result. No real money is charged.',
            style: TextStyle(color: AppColors.muted),
          ),
          const SizedBox(height: 28),
          FilledButton(
            onPressed: _paying ? null : _pay,
            child: _paying
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Pay Now'),
          ),
        ],
      ),
    );
  }
}
