import bcrypt from 'bcryptjs';
import { closeDb, withTransaction } from '../db.js';
import { config } from '../config.js';

const PRODUCTS = [
  [1,"Combo Ức Gà Healthy","Việt Nam","Việt Nam",520,"Giảm mỡ",79000,null,null,["Healthy", "Giàu đạm"], "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500", "Ức gà áp chảo sốt tiêu xanh, ăn kèm gạo lứt Điện Biên và rau củ luộc."],
  [2,"Bún Lứt Trộn Bò Nam Bộ","Việt Nam","Việt Nam",480,"Giữ dáng",74000,null,null,["Bún lứt", "Thịt bò"], "https://images.unsplash.com/photo-1559847844-5315695dadae?w=500", "Thịt bò mềm xào tỏi ít dầu, ăn kèm bún gạo lứt tươi và nước mắm chua ngọt ăn kiêng."],
  [3,"Cơm Gạo Lứt Chả Cá Thát Lát","Việt Nam","Việt Nam",500,"Tăng cơ",84000,null,null,["Cá tươi", "Omega 3"], "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500", "Chả cá thát lát hấp sả ăn kèm cơm gạo lứt và súp lơ xanh."],
  [4,"Phở Bò Gạo Lứt Chuẩn Vị","Việt Nam","Việt Nam",450,"Ít Calo",74000,null,null,["Bánh phở lứt", "Nước dùng trong"], "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500", "Phở bò tái nạm sử dụng bánh phở lứt ninh từ xương bò tách mỡ."],
  [5,"Gỏi Gà Xé Phay Hạt Quinoa","Việt Nam","Việt Nam",410,"Giảm mỡ",74000,null,null,["Gà thả vườn", "Quinoa"], "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500", "Ức gà xé phay trộn bắp cải tím, ngó sen và hạt diêm mạch."],
  [6,"Cơm Bò Lúc Lắc Gạo Lứt","Việt Nam","Việt Nam",540,"Tăng cơ",85000,null,null,["Bò Úc", "Ớt chuông"], "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=500", "Thịt bò cắt khối vuông xào vừa chín tới giữ nguyên vị ngọt mọng nước."],
  [11,"Cơm Trộn Bibimbap Gạo Lứt","Châu Á","Hàn Quốc",550,"Cân bằng",85000,null,null,["Kim chi", "Rau củ"], "https://images.unsplash.com/photo-1553163147-622ab57be1c7?w=500", "Cơm gạo lứt ăn kèm thịt bò xào, trứng ốp la và 6 loại rau củ Hàn Quốc."],
  [13,"Cá Hồi Nướng Teriyaki Gạo Lứt","Châu Á","Nhật Bản",580,"Tăng cơ",99000,null,null,["Omega 3", "Cá hồi"], "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500", "Phi lê cá hồi áp chảo sốt Teriyaki ăn kiêng, đi kèm rong biển và cơm lứt."],
  [14,"Bento Gà Nướng Yakitori Healthy","Châu Á","Nhật Bản",500,"Cân bằng",79000,null,null,["Bento Nhật", "Gà nướng"], "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=500", "Hộp bento Nhật gồm gà nướng sả xiên, trứng cuộn Tamagoyaki và bắp cải."],
  [16,"Pad Thai Tôm Cơm Lứt","Châu Á","Thái Lan",510,"Đổi vị",84000,null,null,["Chua cay", "Tôm sú"], "https://images.unsplash.com/photo-1559847844-5315695dadae?w=500", "Hủ tiếu lứt xào kiểu Thái với tôm sú, giá đỗ và đậu hũ rán kiềm mỡ."],
  [17,"Cà Ruy Xanh Gà Nướng Chuẩn Thái","Châu Á","Thái Lan",540,"Thơm béo",85000,null,null,["Sữa hạnh nhân", "Cà ri"], "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=500", "Ức gà nấu cà ri xanh sử dụng sữa hạnh nhân thay nước cốt dừa đậm đà."],
  [18,"Cà Ri Bò Ấn Độ Tikka Masala Light","Châu Á","Ấn Độ",560,"Giàu gia vị",94000,null,null,["Tikka Masala", "Bò Úc"], "https://images.unsplash.com/photo-1545247181-516773cae754?w=500", "Bò Úc hầm sốt Masala kiểu Ấn dùng sữa chua Hy Lạp không béo."],
  [26,"Mì Ý Carbonara Sốt Kem Yến Mạch","Châu Âu","Ý",520,"Dinh dưỡng",79000,null,null,["Pasta nguyên cám", "Kem yến mạch"], "https://images.unsplash.com/photo-1621996346565-e3def616403c?w=500", "Mì Spaghetti nguyên cám hòa quyện cùng sốt kem yến mạch và dăm bông nạc."],
  [27,"Mì Ý Sốt Bò Băm Bolognese Healthy","Châu Âu","Ý",490,"Tăng cơ",79000,null,null,["Bò băm", "Cà chua tươi"], "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=500", "Pasta làm từ lúa mì lứt sốt bò Úc băm tươi và sốt cà chua tự nấu không đường."],
  [28,"Salad Cá Ngừ Ngô Ngọt Sốt Yogurt","Châu Âu","Anh",380,"Giảm cân",74000,null,null,["Cá ngừ", "Sốt Yogurt"], "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500", "Cá ngừ ngâm nước, xà lách Romaine, ngô ngọt và sốt Hy Lạp Yogurt."],
  [30,"Salad Caesar Ức Gà Nướng lá Thơm","Châu Âu","Ý",420,"Low Carb",74000,null,null,["Salad Caesar", "Gà nướng"], "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500", "Rau xà lách Mỹ tươi giòn, ức gà nướng áp chảo và sốt Caesar ít béo."],
  [32,"Ức Vịt Nướng Sốt Cam Hy Lạp Cơm Lứt","Châu Âu","Pháp",540,"Tăng cơ",88000,null,null,["Ức vịt", "Sốt cam Pháp"], "https://images.unsplash.com/photo-1514944288352-fffac99f0bdf?w=500", "Ức vịt áp chảo bỏ da sốt cam tươi thanh mát ngọt dịu chuẩn ẩm thực Pháp."],
  [34,"Cơm Paella Hải Sản Tây Ban Nha Healthy","Châu Âu","Tây Ban Nha",530,"Giàu Omega",90000,null,null,["Cơm Paella", "Tôm mực"], "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=500", "Cơm nghệ gạo lứt xào tôm sú, mực tươi và nghêu nghệ kiểu Tây Ban Nha."],
  [39,"Steak Bò Áp Chảo Kèm Măng Tây","Châu Mỹ","Mỹ",610,"Tăng cơ",108000,null,null,["Bò Úc", "Bít tết"], "https://images.unsplash.com/photo-1544025162-d76694265947?w=500", "Bít tết bò nạc áp chảo thảo mộc rosemary, măng tây và khoai tây nướng nguyên vỏ."],
  [40,"Burger Gà Lúa Mạch Kèm Salad","Châu Mỹ","Mỹ",490,"Cheat Clean",79000,null,null,["Burger nguyên cám", "Ức gà"], "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500", "Vỏ bánh burger nguyên cám, nhân ức gà xay nướng lá oregano và cà chua."],
  [41,"Tôm Sốt Bơ Tỏi Kèm Bánh Mỳ Lúa Mạch","Châu Mỹ","Mỹ",510,"Tăng cơ",84000,null,null,["Tôm sú", "Bơ ghee"], "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=500", "Tôm sú sốt bơ ghee thảo mộc ăn kèm bánh mì đen lúa mạch nướng giòn."],
  [43,"Taco Bò Băm Vỏ Bánh Ngô Mexico","Châu Mỹ","Mexico",470,"Ít béo",74000,null,null,["Taco", "Vỏ ngô"], "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500", "Bánh Taco vỏ ngô nguyên giòn nhồi bò nạc xào ớt chuông Salsa Mexico."],
  [44,"Burrito Ức Gà Đậu Đen Giảm Cân","Châu Mỹ","Mexico",500,"Giàu chất xơ",79000,null,null,["Burrito", "Đậu đen"], "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=500", "Bánh cuộn Burrito nguyên cám nhồi ức gà nướng, đậu đen Mexico và sốt bơ avocado."],
  [46,"Churrasco Bò Úc Nướng Than Argentina","Châu Mỹ","Argentina",580,"Tăng cơ mạnh",97000,null,null,["Sốt Chimichurri", "Bò nướng"], "https://images.unsplash.com/photo-1544025162-d76694265947?w=500", "Bò Úc nướng than sốt Chimichurri thảo mộc ngò tây chanh tỏi thơm ngon."],
  [47,"Lườn Cừu Nướng Lá Hương Thảo Úc","Châu Đại Dương","Úc",590,"Giàu Sắt",97000,null,null,["Thịt cừu Úc", "Rosemary"], "https://images.unsplash.com/photo-1544025162-d76694265947?w=500", "Sườn cừu Úc nướng lá hương thảo ăn kèm khoai tây nghiền sữa hạnh nhân."],
  [48,"Barramundi Cá Chẽm Nướng Bơ Chanh Úc","Châu Đại Dương","Úc",470,"Tăng Đạm",79000,null,null,["Cá Chẽm Úc", "Sốt bơ chanh"], "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500", "Phi lê cá chẽm Barramundi biển Úc nướng bơ ghee chanh vàng măng tây."],
  [49,"Bowl Bơ Trừng Poached Kiểu Melbourne","Châu Đại Dương","Úc",430,"Eat Clean",74000,null,null,["Quả bơ", "Trứng chần"], "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500", "Bát dinh dưỡng gồm bơ sáp lát, trứng Poached lòng đào, hạt chia và rau mầm."],
  [50,"Súp Hải Sản Kiwi Đảo New Zealand","Châu Đại Dương","New Zealand",450,"Giảm béo",79000,null,null,["Vẹm xanh", "Súp hải sản"], "https://images.unsplash.com/photo-1547592180-85f173990554?w=500", "Súp vẹm xanh New Zealand hầm cùng cà chua tươi và cần tây thanh lọc."],
  [501,"Cơm Lứt Bò Úc Sốt Tiêu Rừng Sydney","Châu Đại Dương","Úc",560,"Tăng cơ",94000,null,null,["Bò Úc", "Tiêu rừng"], "https://images.unsplash.com/photo-1544025162-d76694265947?w=500", "Bò Úc nạc xào tiêu rừng Tasmania thơm nức kèm cơm gạo lứt."],
  [504,"Ức Gà Nướng Sốt Bơ Hạt Macca Úc","Châu Đại Dương","Úc",520,"Tăng cơ",79000,null,null,["Ức gà", "Hạt Macca"], "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500", "Ức gà áp chảo phủ sốt hạt Macca bùi béo tự nhiên."],
  [701,"Cơm Couscous Thịt Bò Hầm Tagine Morocco","Châu Phi","Morocco",530,"Giàu xơ",85000,null,null,["Couscous", "Bò hầm Tagine"], "https://images.unsplash.com/photo-1544025162-d76694265947?w=500", "Thịt bò thăn hầm nghệ, quế tươi nướng trong nồi gốm Tagine ăn kèm hạt Couscous lúa mì."],
  [702,"Gà Nướng Gia Vị Peri-Peri Nam Phi Cơm Lứt","Châu Phi","Nam Phi",510,"Đổi vị",79000,null,null,["Peri-Peri", "Gà nướng"], "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=500", "Ức gà nướng sốt ớt Peri-Peri chuẩn vị Nam Phi thơm cay nồng ấm."],
  [703,"Cơm Jollof Gạo Lứt Tôm Sú Nigeria","Châu Phi","Nigeria",490,"Cân bằng",84000,null,null,["Jollof Rice", "Tôm sú"], "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=500", "Cơm gạo lứt nấu với cà chua tươi, hành tây và tôm sú nướng mộc."],
  [704,"Súp Đậu Phộng Gà Nướng Kiểu Ghana","Châu Phi","Ghana",520,"Giàu đạm",79000,null,null,["Súp đậu phộng", "Gà ta"], "https://images.unsplash.com/photo-1547592180-85f173990554?w=500", "Súp bơ đậu phộng tự nhiên ninh cùng ức gà và cà chua thơm bùi."],
  [708,"Cơm Couscous Cá Hồi Sốt Chanh Thảo Mộc Morocco","Châu Phi","Morocco",540,"Omega 3",90000,null,null,["Cá hồi", "Couscous"], "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500", "Phi lê cá hồi áp chảo đặt trên thảm hạt Couscous trộn rau ngò tươi."],
  [711,"Cá Tuyết Nướng Sốt Harissa Tunisia Cơm Lứt","Châu Phi","Tunisia",490,"Đậm vị",84000,null,null,["Cá tuyết", "Harissa"], "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500", "Cá tuyết nướng phủ sốt ớt ngọt Harissa đặc sản Bắc Phi."],
  [51,"Bowl Hạt Quinoa & Đậu Nành Edamame","Chay","Quốc tế",390,"Pure Vegan",69000,null,null,["100% Chay", "Quinoa"], "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500", "Bát dinh dưỡng chay với Quinoa, đậu Nhật Edamame, bơ chín và hạt ốc chó."],
  [52,"Cơm Lứt Nấm Mối Đen Kho Tiêu","Chay","Việt Nam",410,"Thanh lọc",74000,null,null,["Nấm tươi", "Cơm lứt"], "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500", "Nấm mối đen mọng nước kho tiêu xanh ăn cùng cơm gạo lứt huyết rồng."],
  [53,"Lẩu Nấm Mini Đơn Chiết Keto","Chay","Quốc tế",380,"Keto Chay",69000,null,null,["5 Loại nấm", "Tàu hũ"], "https://images.unsplash.com/photo-1547592180-85f173990554?w=500", "Suất lẩu cá nhân với 5 loại nấm tươi quý và đậu hũ non ăn kèm bún lứt."],
  [54,"Salad Đậu Chickpea Hạt Mè","Chay","Địa Trung Hải",360,"Giảm mỡ",69000,null,null,["Đậu gà", "Mè rang"], "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500", "Đậu gà nướng giòn trộn xà lách, dưa chuột và nước sốt mè rang béo nhẹ."],
  [55,"Curry Đậu Lăng Vàng Kiểu Ấn Chay","Chay","Ấn Độ",400,"Thanh lọc",69000,null,null,["Đậu lăng", "Cà ri chay"], "https://images.unsplash.com/photo-1545247181-516773cae754?w=500", "Đậu lăng vàng hầm cà ri nước cốt hạnh nhân ăn kèm cơm gạo lứt."],
  [56,"Mì Ý Sốt Nấm Mỡ & Truffle Chay","Chay","Ý",420,"Gourmet",74000,null,null,["Sốt Truffle", "Nấm mỡ"], "https://images.unsplash.com/photo-1621996346565-e3def616403c?w=500", "Pasta nguyên cám sốt nấm mỡ kem yến mạch hương nấm Truffle quý giá."],
];

async function main() {
  if (!config.adminPassword || config.adminPassword === 'change-this-password') {
    throw new Error('ADMIN_PASSWORD chưa được cấu hình. Hãy copy .env.example thành .env và đặt mật khẩu admin riêng.');
  }
  await withTransaction(async (client) => {
    const adminHash = await bcrypt.hash(config.adminPassword, 12);
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, 'Quản trị viên', 'admin')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, role = 'admin', updated_at = NOW()`,
      [config.adminEmail, adminHash]
    );
    for (const p of PRODUCTS) {
      await client.query(
        `INSERT INTO products (id,title,region,country,calories,goal,price,old_price,rating,tags,image,description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
         ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,region=EXCLUDED.region,country=EXCLUDED.country,calories=EXCLUDED.calories,goal=EXCLUDED.goal,price=EXCLUDED.price,old_price=EXCLUDED.old_price,rating=EXCLUDED.rating,tags=EXCLUDED.tags,image=EXCLUDED.image,description=EXCLUDED.description,updated_at=NOW()`,
        [p[0],p[1],p[2],p[3],p[4],p[5],p[6],p[7],p[8],JSON.stringify(p[9]),p[10],p[11]]
      );
    }
  });
  console.log(`[seed] admin: ${config.adminEmail}`);
  console.log(`[seed] products: ${PRODUCTS.length}`);
}

main().catch(error => {
  console.error('[seed] failed', error);
  process.exitCode = 1;
}).finally(closeDb);
