import 'package:flutter/material.dart';

class ServiceCategory {
  const ServiceCategory({
    required this.id,
    required this.name,
    required this.description,
    required this.icon,
    required this.startingPriceRwf,
  });

  final String id;
  final String name;
  final String description;
  final IconData icon;
  final int startingPriceRwf;
}
