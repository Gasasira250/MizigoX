import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/payment.dart';
import '../providers/auth_provider.dart';
import '../providers/booking_provider.dart';
import '../providers/payment_provider.dart';
import '../utils/constants.dart';
import '../utils/formatters.dart';
import '../utils/validators.dart';
import '../widgets/empty_state.dart';
import '../widgets/primary_button.dart';
import 'booking_success_screen.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});

  static const routeName = '/payment';

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _phone;
  final _cardNumber = TextEditingController(text: '4111 1111 1111 1111');
  final _cardName = TextEditingController(text: AppConstants.demoName);
  final _cardExpiry = TextEditingController(text: '12/28');
  final _cardCvv = TextEditingController(text: '123');

  @override
  void initState() {
    super.initState();
    _phone = TextEditingController(text: context.read<AuthProvider>().user?.phone ?? AppConstants.demoPhone);
  }

  @override
  void dispose() {
    _phone.dispose();
    _cardNumber.dispose();
    _cardName.dispose();
    _cardExpiry.dispose();
    _cardCvv.dispose();
    super.dispose();
  }

  Future<void> _pay() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }
    final draft = context.read<BookingProvider>().draft;
    final user = context.read<AuthProvider>().user;
    if (draft == null || user == null) {
      return;
    }
    final payments = context.read<PaymentProvider>();
    final bookings = context.read<BookingProvider>();
    final existingId = ModalRoute.of(context)?.settings.arguments as String?;
    try {
      final booking = existingId != null
          ? bookings.byId(existingId) ?? await bookings.createPending(user.id)
          : await bookings.createPending(user.id);
      final result = await payments.pay(
        amountRwf: draft.amountRwf,
        request: PaymentRequest(
          phone: _phone.text,
          cardNumber: _cardNumber.text,
          cardHolder: _cardName.text,
          cardExpiry: _cardExpiry.text,
          cardCvv: _cardCvv.text,
        ),
      );
      final updated = await bookings.applyPayment(booking, result);
      if (!mounted) {
        return;
      }
      Navigator.of(context).pushNamed(
        BookingSuccessScreen.routeName,
        arguments: updated.id,
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = context.watch<BookingProvider>().draft;
    final payments = context.watch<PaymentProvider>();
    if (draft == null) {
      return const Scaffold(body: EmptyState(title: 'Nothing to pay', message: 'Create a booking first.'));
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Payment')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text('Amount due', style: Theme.of(context).textTheme.bodySmall),
            Text(Formatters.rwf(draft.amountRwf), style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(AppConstants.paymentsDisclaimer, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            RadioGroup<PaymentMethod>(
              groupValue: payments.method,
              onChanged: (value) {
                if (value != null) {
                  payments.selectMethod(value);
                }
              },
              child: Column(
                children: [
                  for (final method in PaymentMethod.values)
                    RadioListTile<PaymentMethod>(
                      value: method,
                      title: Text(method.label),
                      subtitle: Text(method.description),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            if (payments.method == PaymentMethod.card) ...[
              TextFormField(
                controller: _cardName,
                decoration: const InputDecoration(labelText: 'Name on card'),
                validator: (value) => Validators.requiredField(value, 'the cardholder name'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _cardNumber,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Card number'),
                validator: Validators.cardNumber,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _cardExpiry,
                      decoration: const InputDecoration(labelText: 'MM/YY'),
                      validator: Validators.cardExpiry,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _cardCvv,
                      decoration: const InputDecoration(labelText: 'CVV'),
                      validator: Validators.cardCvv,
                    ),
                  ),
                ],
              ),
            ] else
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(labelText: '${payments.method.label} number'),
                validator: Validators.rwandaPhone,
              ),
            const SizedBox(height: 12),
            Text(
              'Demo rule: mobile numbers ending in 000 and cards ending in 0000 fail. All other valid details succeed. No live payment provider is called.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (payments.error != null) ...[
              const SizedBox(height: 12),
              Text(payments.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 20),
            PrimaryButton(
              label: 'Pay ${Formatters.rwf(draft.amountRwf)}',
              loading: payments.isLoading || context.watch<BookingProvider>().isLoading,
              onPressed: _pay,
            ),
          ],
        ),
      ),
    );
  }
}
