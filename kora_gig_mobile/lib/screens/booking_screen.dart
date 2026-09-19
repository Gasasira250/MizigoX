import 'package:flutter/material.dart';

import '../models/booking.dart';
import '../models/professional.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';

class BookingScreen extends StatefulWidget {
  const BookingScreen({super.key, required this.professional});

  final Professional professional;

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  late String _service;
  DateTime _date = DateTime(2026, 9, 25);
  TimeOfDay _time = const TimeOfDay(hour: 10, minute: 0);
  final _location = TextEditingController(text: 'Kigali');
  final _description = TextEditingController(
    text: 'Need electrical wiring for my house.',
  );
  bool _summary = false;

  @override
  void initState() {
    super.initState();
    _service = widget.professional.services.first;
    if (widget.professional.trade != 'Electrician') {
      _description.text =
          'Need ${widget.professional.trade.toLowerCase()} help at my house.';
    }
  }

  @override
  void dispose() {
    _location.dispose();
    _description.dispose();
    super.dispose();
  }

  DateTime get _scheduledAt =>
      DateTime(_date.year, _date.month, _date.day, _time.hour, _time.minute);

  BookingDraft get _draft => BookingDraft(
    professionalId: widget.professional.id,
    professionalName: widget.professional.name,
    trade: widget.professional.trade,
    service: _service,
    scheduledAt: _scheduledAt,
    location: _location.text.trim(),
    description: _description.text.trim(),
    serviceFeeRwf: widget.professional.serviceFeeRwf,
  );

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2026, 9, 19),
      lastDate: DateTime(2027, 12, 31),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _time);
    if (picked != null) setState(() => _time = picked);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_summary ? 'Booking Summary' : 'Book Service'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          if (!_summary) ...[
            const Text(
              'Service',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _service,
              items: [
                for (final service in widget.professional.services)
                  DropdownMenuItem(value: service, child: Text(service)),
              ],
              onChanged: (value) {
                if (value != null) setState(() => _service = value);
              },
            ),
            const SizedBox(height: 16),
            const Text('Date', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            _PickerTile(
              label: formatLongDate(_date),
              icon: Icons.calendar_today_outlined,
              onTap: _pickDate,
            ),
            const SizedBox(height: 16),
            const Text('Time', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            _PickerTile(
              label: _time.format(context),
              icon: Icons.schedule,
              onTap: _pickTime,
            ),
            const SizedBox(height: 16),
            const Text(
              'Location',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            TextField(controller: _location),
            const SizedBox(height: 16),
            const Text(
              'Description',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            TextField(controller: _description, maxLines: 4),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () {
                if (_location.text.trim().isEmpty ||
                    _description.text.trim().isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Please add a location and description.'),
                    ),
                  );
                  return;
                }
                setState(() => _summary = true);
              },
              child: const Text('Continue'),
            ),
          ] else ...[
            _SummaryRow(label: 'Professional', value: widget.professional.name),
            _SummaryRow(label: 'Service', value: _service),
            _SummaryRow(label: 'Date', value: formatShortDate(_date)),
            _SummaryRow(label: 'Time', value: _time.format(context)),
            _SummaryRow(label: 'Location', value: _location.text.trim()),
            const SizedBox(height: 16),
            _SummaryRow(
              label: 'Service fee',
              value: formatRwf(widget.professional.serviceFeeRwf),
              emphasize: true,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () {
                Navigator.of(context).pushNamed('/payment', arguments: _draft);
              },
              child: const Text('Continue to Payment'),
            ),
            const SizedBox(height: 10),
            TextButton(
              onPressed: () => setState(() => _summary = false),
              child: const Text('Edit details'),
            ),
          ],
        ],
      ),
    );
  }
}

class _PickerTile extends StatelessWidget {
  const _PickerTile({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              Icon(icon, color: AppColors.forest),
              const SizedBox(width: 12),
              Expanded(
                child: Text(label, style: const TextStyle(fontSize: 16)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.label,
    required this.value,
    this.emphasize = false,
  });

  final String label;
  final String value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: const TextStyle(color: AppColors.muted)),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: emphasize ? 18 : 16,
                color: emphasize ? AppColors.forest : AppColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
