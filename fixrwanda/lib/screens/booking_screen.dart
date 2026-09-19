import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/booking.dart';
import '../providers/auth_provider.dart';
import '../providers/booking_provider.dart';
import '../providers/professional_provider.dart';
import '../utils/formatters.dart';
import '../utils/validators.dart';
import '../widgets/empty_state.dart';
import '../widgets/primary_button.dart';
import 'booking_summary_screen.dart';

class BookingScreen extends StatefulWidget {
  const BookingScreen({super.key});

  static const routeName = '/booking';

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  final _formKey = GlobalKey<FormState>();
  late DateTime _date;
  late TimeOfDay _time;
  late final TextEditingController _address;
  late final TextEditingController _notes;

  static const _slots = [
    TimeOfDay(hour: 8, minute: 0),
    TimeOfDay(hour: 9, minute: 0),
    TimeOfDay(hour: 10, minute: 0),
    TimeOfDay(hour: 11, minute: 0),
    TimeOfDay(hour: 13, minute: 0),
    TimeOfDay(hour: 14, minute: 0),
    TimeOfDay(hour: 15, minute: 0),
    TimeOfDay(hour: 16, minute: 0),
  ];

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthProvider>().user;
    final draft = context.read<BookingProvider>().draft;
    final initial = draft?.scheduledAt ?? DateTime.now().add(const Duration(days: 1));
    _date = DateTime(initial.year, initial.month, initial.day);
    _time = TimeOfDay(hour: initial.hour == 0 ? 9 : initial.hour, minute: 0);
    _address = TextEditingController(text: draft?.address.isNotEmpty == true ? draft!.address : user?.address ?? '');
    _notes = TextEditingController(text: draft?.notes ?? '');
  }

  @override
  void dispose() {
    _address.dispose();
    _notes.dispose();
    super.dispose();
  }

  DateTime get _scheduledAt => DateTime(_date.year, _date.month, _date.day, _time.hour, _time.minute);

  Future<void> _pickDate() async {
    final selected = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 60)),
    );
    if (selected != null) {
      setState(() => _date = selected);
    }
  }

  void _continue(String professionalId) {
    if (!_formKey.currentState!.validate()) {
      return;
    }
    if (_scheduledAt.isBefore(DateTime.now())) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a future date and time')),
      );
      return;
    }
    final professional = context.read<ProfessionalProvider>().professionalById(professionalId);
    if (professional == null) {
      return;
    }
    context.read<BookingProvider>().startDraft(
          BookingDraft(
            professionalId: professional.id,
            serviceCategoryId: professional.serviceCategoryId,
            scheduledAt: _scheduledAt,
            address: _address.text.trim(),
            notes: _notes.text.trim(),
            amountRwf: professional.startingPriceRwf,
          ),
        );
    Navigator.of(context).pushNamed(BookingSummaryScreen.routeName);
  }

  @override
  Widget build(BuildContext context) {
    final professionalId = ModalRoute.of(context)!.settings.arguments as String;
    final professional = context.watch<ProfessionalProvider>().professionalById(professionalId);
    if (professional == null) {
      return const Scaffold(body: EmptyState(title: 'Missing professional', message: 'Go back and choose a professional.'));
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Book a visit')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(professional.name, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            Text('Starting price ${Formatters.rwf(professional.startingPriceRwf)}'),
            const SizedBox(height: 20),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Date'),
              subtitle: Text(Formatters.date(_date)),
              trailing: const Icon(Icons.event),
              onTap: _pickDate,
            ),
            const SizedBox(height: 8),
            Text('Time', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final slot in _slots)
                  ChoiceChip(
                    label: Text('${slot.hour.toString().padLeft(2, '0')}:00'),
                    selected: _time.hour == slot.hour,
                    onSelected: (_) => setState(() => _time = slot),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _address,
              decoration: const InputDecoration(labelText: 'Service address in Kigali'),
              validator: Validators.address,
              maxLines: 2,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _notes,
              decoration: const InputDecoration(labelText: 'Notes for the professional'),
              maxLines: 3,
            ),
            const SizedBox(height: 24),
            PrimaryButton(label: 'Review booking', onPressed: () => _continue(professional.id)),
          ],
        ),
      ),
    );
  }
}
