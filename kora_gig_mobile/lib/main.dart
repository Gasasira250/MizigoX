import 'package:flutter/material.dart';

import 'app.dart';
import 'app_controller.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(KoraGigApp(controller: AppController()));
}
