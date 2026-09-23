/**
 * Harici gönderici havuzu — plan §5b.
 *
 * 🔑 Bu göndericiler mock'ta **ŞİRKET OLARAK TANIMLI DEĞİLDİR**. Amaç tam da bu:
 * geliştiricinin gelen kutusuna *dışarıdan* gelmiş gibi görünsünler. Tanımlı bir
 * şirketten gelen trafik, "kendi kendine yazan" bir sandbox hissi verirdi.
 *
 * 🔴 Public depo kapısı (plan §2b/4): her kimlik SENTETİK. VKN'ler tek rakamın
 * tekrarı, unvanlar `DENEME`/`ÖRNEK` damgalı. `corpus-identity` testinin aradığı
 * desenle aynı.
 */
export interface ExternalSender {
  taxNumber: string;
  name: string;
  taxOffice: string;
  address: string;
  district: string;
  city: string;
}

export const EXTERNAL_SENDERS: readonly ExternalSender[] = [
  {
    taxNumber: '4444444444',
    name: 'DENEME TEDARİK VE LOJİSTİK A.Ş.',
    taxOffice: 'DENEME VERGİ DAİRESİ',
    address: 'Deneme Organize Sanayi 3. Cadde No:14',
    district: 'Şehitkamil',
    city: 'Gaziantep',
  },
  {
    taxNumber: '5555555555',
    name: 'ÖRNEK GIDA SANAYİ LİMİTED ŞİRKETİ',
    taxOffice: 'ÖRNEK VERGİ DAİRESİ',
    address: 'Örnek Mahallesi Fabrika Sokak No:7',
    district: 'Nilüfer',
    city: 'Bursa',
  },
  {
    taxNumber: '6666666666',
    name: 'DENEME YAZILIM VE DANIŞMANLIK A.Ş.',
    taxOffice: 'DENEME VERGİ DAİRESİ',
    address: 'Deneme Teknokent B Blok No:3',
    district: 'Çankaya',
    city: 'Ankara',
  },
  {
    taxNumber: '7777777777',
    name: 'ÖRNEK MAKİNE İMALAT LİMİTED ŞİRKETİ',
    taxOffice: 'ÖRNEK VERGİ DAİRESİ',
    address: 'Örnek Sanayi Sitesi 12. Blok No:5',
    district: 'Konak',
    city: 'İzmir',
  },
  {
    taxNumber: '8888888888',
    name: 'DENEME AMBALAJ VE KAĞIT A.Ş.',
    taxOffice: 'DENEME VERGİ DAİRESİ',
    address: 'Deneme Cadde No:88',
    district: 'Kartal',
    city: 'İstanbul',
  },
] as const;
