# Bu projeyi Vercel hesabına (orcincon-5839s-projects) deploy etme

## 1. Vercel CLI kur (yoksa)

```powershell
npm i -g vercel
```

## 2. Doğru hesapla giriş yap

```powershell
vercel login
```

- Tarayıcı açılır; **orcincon-5839s** hesabıyla giriş yap (Google/GitHub/Email — hangi yöntemle o hesabı kullanıyorsan).
- Zaten başka hesapla girişliysen: `vercel logout` yap, sonra tekrar `vercel login` ile doğru hesaba gir.

## 3. Proje klasöründe ol

```powershell
cd D:\woxibulksave
```

## 4. Eski link varsa kaldır (farklı hesaba bağlıysa)

```powershell
rmdir /s /q .vercel
```

(Bu klasör yoksa hata vermez.)

## 5. Projeyi bu hesaba bağla

```powershell
vercel link
```

Sorulduğunda:

- **Set up and deploy?** → `Y`
- **Which scope do you want to deploy to?** → **orcincon-5839s** (veya listada gördüğün o hesap/takım adı) seç.
- **Link to existing project?** → `N` (yeni proje) veya `Y` (zaten Vercel’de proje varsa onu seç).
- **What’s your project’s name?** → `woxibulksave` (veya istediğin isim).

Böylece proje **orcincon-5839s** hesabına bağlanmış olur.

## 6. Production deploy

```powershell
vercel --prod
```

veya:

```powershell
npm run deploy
```

---

**Özet:** Önce `vercel login` ile orcincon-5839s hesabına gir, sonra `vercel link` ile scope olarak o hesabı seç, en son `vercel --prod` ile deploy et.
