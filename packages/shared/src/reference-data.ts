export interface CurrencyDefinition {
  code: string;
  name: string;
  decimalPlaces: number;
  symbol: string;
  isActive: boolean;
}

export interface CountryDefinition {
  code: string;
  iso3: string;
  name: string;
  phoneCountryCode: string;
  defaultTimezone: string;
  defaultCurrencyCode: string;
  isActive: boolean;
  addressSchema: {
    fields: string[];
    required: string[];
  };
}

export const CURRENCIES: readonly CurrencyDefinition[] = [
  { code: 'RWF', name: 'Rwandan Franc', decimalPlaces: 0, symbol: 'FRw', isActive: true },
  { code: 'UGX', name: 'Ugandan Shilling', decimalPlaces: 0, symbol: 'USh', isActive: false },
  { code: 'KES', name: 'Kenyan Shilling', decimalPlaces: 2, symbol: 'KSh', isActive: false },
  { code: 'TZS', name: 'Tanzanian Shilling', decimalPlaces: 0, symbol: 'TSh', isActive: false },
  { code: 'BIF', name: 'Burundian Franc', decimalPlaces: 0, symbol: 'FBu', isActive: false },
  { code: 'SSP', name: 'South Sudanese Pound', decimalPlaces: 2, symbol: 'SS£', isActive: false },
  { code: 'CDF', name: 'Congolese Franc', decimalPlaces: 2, symbol: 'FC', isActive: false },
  { code: 'USD', name: 'United States Dollar', decimalPlaces: 2, symbol: '$', isActive: false },
];

export const COUNTRIES: readonly CountryDefinition[] = [
  {
    code: 'RW',
    iso3: 'RWA',
    name: 'Rwanda',
    phoneCountryCode: '+250',
    defaultTimezone: 'Africa/Kigali',
    defaultCurrencyCode: 'RWF',
    isActive: true,
    addressSchema: {
      fields: ['province', 'district', 'sector', 'cell', 'village', 'street', 'landmark'],
      required: ['district'],
    },
  },
  {
    code: 'UG',
    iso3: 'UGA',
    name: 'Uganda',
    phoneCountryCode: '+256',
    defaultTimezone: 'Africa/Kampala',
    defaultCurrencyCode: 'UGX',
    isActive: false,
    addressSchema: {
      fields: ['region', 'district', 'city', 'street', 'postalCode', 'landmark'],
      required: ['district'],
    },
  },
  {
    code: 'KE',
    iso3: 'KEN',
    name: 'Kenya',
    phoneCountryCode: '+254',
    defaultTimezone: 'Africa/Nairobi',
    defaultCurrencyCode: 'KES',
    isActive: false,
    addressSchema: {
      fields: ['county', 'city', 'street', 'postalCode', 'landmark'],
      required: ['county'],
    },
  },
  {
    code: 'TZ',
    iso3: 'TZA',
    name: 'Tanzania',
    phoneCountryCode: '+255',
    defaultTimezone: 'Africa/Dar_es_Salaam',
    defaultCurrencyCode: 'TZS',
    isActive: false,
    addressSchema: {
      fields: ['region', 'district', 'city', 'street', 'postalCode', 'landmark'],
      required: ['region'],
    },
  },
  {
    code: 'BI',
    iso3: 'BDI',
    name: 'Burundi',
    phoneCountryCode: '+257',
    defaultTimezone: 'Africa/Bujumbura',
    defaultCurrencyCode: 'BIF',
    isActive: false,
    addressSchema: {
      fields: ['province', 'commune', 'city', 'street', 'landmark'],
      required: ['province'],
    },
  },
  {
    code: 'SS',
    iso3: 'SSD',
    name: 'South Sudan',
    phoneCountryCode: '+211',
    defaultTimezone: 'Africa/Juba',
    defaultCurrencyCode: 'SSP',
    isActive: false,
    addressSchema: {
      fields: ['state', 'county', 'city', 'street', 'landmark'],
      required: ['state'],
    },
  },
  {
    code: 'CD',
    iso3: 'COD',
    name: 'Democratic Republic of the Congo',
    phoneCountryCode: '+243',
    defaultTimezone: 'Africa/Kinshasa',
    defaultCurrencyCode: 'CDF',
    isActive: false,
    addressSchema: {
      fields: ['province', 'city', 'commune', 'street', 'landmark'],
      required: ['province'],
    },
  },
];
