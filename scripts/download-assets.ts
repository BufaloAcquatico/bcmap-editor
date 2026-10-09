import * as fs from 'fs';
import * as path from 'path';
import https from 'https';

const BASE_URL = 'https://www.bondage-europe.com/R132/BondageClub/Screens/Online/ChatRoom';

const TILES = [
  { type: 'Floor', style: 'OakWood' },
  { type: 'Floor', style: 'Stone' },
  { type: 'Floor', style: 'Pavement' },
  { type: 'Floor', style: 'Ceramic' },
  { type: 'Floor', style: 'CeramicDark' },
  { type: 'Floor', style: 'CarpetPink' },
  { type: 'Floor', style: 'CarpetBlue' },
  { type: 'Floor', style: 'CarpetRed' },
  { type: 'Floor', style: 'Padded' },
  { type: 'Floor', style: 'LatexFloor' },
  { type: 'Floor', style: 'Tile' },
  { type: 'Floor', style: 'HexBlue' },
  { type: 'Floor', style: 'HexPurple' },
  { type: 'Floor', style: 'Machine' },
  { type: 'Floor', style: 'HalfWall' },
  { type: 'FloorExterior', style: 'Dirt' },
  { type: 'FloorExterior', style: 'Grass' },
  { type: 'FloorExterior', style: 'LongGrass' },
  { type: 'FloorExterior', style: 'Sand' },
  { type: 'FloorExterior', style: 'Gravel' },
  { type: 'FloorExterior', style: 'Asphalt' },
  { type: 'FloorExterior', style: 'Snow' },
  { type: 'FloorExterior', style: 'StoneSquareGray' },
  { type: 'FloorExterior', style: 'ScatteredLeaves' },
  { type: 'FloorExterior', style: 'ScatteredLeavesDirt' },
  { type: 'FloorExterior', style: 'ScatteredLeavesThick' },
  { type: 'Wall', style: 'MixedWood' },
  { type: 'Wall', style: 'CedarWood' },
  { type: 'Wall', style: 'Log' },
  { type: 'Wall', style: 'Japanese' },
  { type: 'Wall', style: 'Stone' },
  { type: 'Wall', style: 'Brick' },
  { type: 'Wall', style: 'Dungeon' },
  { type: 'Wall', style: 'Square' },
  { type: 'Wall', style: 'Steel' },
  { type: 'Wall', style: 'Padded' },
  { type: 'Wall', style: 'Tile' },
  { type: 'Wall', style: 'Lattice' },
  { type: 'Wall', style: 'HexBlue' },
  { type: 'Wall', style: 'HexPurple' },
  { type: 'Wall', style: 'PipeBlue' },
  { type: 'Wall', style: 'PipePurple' },
  { type: 'Wall', style: 'SteelBlack' },
  { type: 'Wall', style: 'SteelGary' },
  { type: 'Water', style: 'Pool' },
  { type: 'Water', style: 'Sea' },
  { type: 'Water', style: 'Ocean' },
  { type: 'Water', style: 'OceanCyan' },
  { type: 'Water', style: 'OceanCalm' },
  { type: 'Water', style: 'Swamp' },
  { type: 'Water', style: 'Waves' },
  { type: 'Water', style: 'Shallow' },
  { type: 'Water', style: 'Lava' }
];

const OBJECTS = [
  { type: 'FloorDecoration', style: 'EntryFlag' },
  { type: 'FloorDecoration', style: 'ExitFlag' },
  { type: 'FloorDecoration', style: 'KeyBronze' },
  { type: 'FloorDecoration', style: 'KeySilver' },
  { type: 'FloorDecoration', style: 'KeyGold' },
  { type: 'FloorDecoration', style: 'Bed' },
  { type: 'FloorDecorationThemed', style: 'ShibariFrame' },
  { type: 'FloorDecorationParty', style: 'BalloonFiveColor' },
  { type: 'FloorDecorationCamping', style: 'LogFire' },
  { type: 'FloorDecorationExpanding', style: 'CouchPinkPreview' },
  { type: 'FloorDecorationAnimal', style: 'CatCaramelHappy' },
  { type: 'FloorDecorationAnimal', style: 'DogBrownHappy' },
  { type: 'FloorDecorationAnimal', style: 'RabbitBrownStand' },
  { type: 'FloorDecorationAnimal', style: 'ChickenBrownIdleLeft' },
  { type: 'FloorItem', style: 'Kennel' },
  { type: 'FloorItem', style: 'X-Cross' },
  { type: 'FloorItem', style: 'BondageBench' },
  { type: 'FloorItem', style: 'Trolley' },
  { type: 'FloorItem', style: 'Locker' },
  { type: 'FloorItem', style: 'WoodenBox' },
  { type: 'FloorItem', style: 'Coffin' },
  { type: 'FloorItem', style: 'TheDisplayFrame' },
  { type: 'FloorItem', style: 'Pole' },
  { type: 'FloorItem', style: 'MedicalBed' },
  { type: 'FloorItem', style: 'FuturisticCrate' },
  { type: 'FloorNumber', style: 'Number1' },
  { type: 'FloorLetter', style: 'LetterA' },
  { type: 'FloorIcon', style: 'IconCircle' },
  { type: 'FloorObstacle', style: 'VelourRopeBarrier' },
  { type: 'FloorObstacle', style: 'OakTree' },
  { type: 'FloorObstacle', style: 'LeaflessTree' },
  { type: 'FloorObstacle', style: 'PineTree' },
  { type: 'FloorObstacle', style: 'PalmTree' },
  { type: 'FloorObstacle', style: 'Sakura' },
  { type: 'FloorObstacle', style: 'Cactus' },
  { type: 'FloorObstacle', style: 'ChristmasTree' },
  { type: 'FloorObstacle', style: 'Window' },
  { type: 'FloorObstacle', style: 'TrashCan' },
  { type: 'FloorObstacle', style: 'RoadCone' },
  { type: 'FloorObstacle', style: 'LampPost' },
  { type: 'FloorObstacle', style: 'Pillar' },
  { type: 'WallDecoration', style: 'Painting' },
  { type: 'WallDecoration', style: 'Mirror' },
  { type: 'WallDecoration', style: 'Candelabra0' },
  { type: 'WallDecoration', style: 'Whip' },
  { type: 'WallDecoration', style: 'Fireplace' },
  { type: 'WallDecoration', style: 'Stocking' },
  { type: 'WallPath', style: 'WoodOpen' },
  { type: 'WallPath', style: 'WoodClosed' },
  { type: 'WallPath', style: 'WoodLocked' },
  { type: 'WallPath', style: 'WoodLockedBronze' },
  { type: 'WallPath', style: 'WoodLockedSilver' },
  { type: 'WallPath', style: 'WoodLockedGold' },
  { type: 'WallPath', style: 'Metal' },
  { type: 'WallPath', style: 'MetalUp' },
  { type: 'WallPath', style: 'MetalDown' },
  { type: 'WallPath', style: 'MetalLockedBronze' },
  { type: 'WallPath', style: 'MetalLockedSilver' },
  { type: 'WallPath', style: 'MetalLockedGold' },
  { type: 'WallPath', style: 'BrownDoor' },
  { type: 'WallPath', style: 'BrownDoorOpen' },
  { type: 'Banners', style: 'Blue' },
  { type: 'Banners', style: 'Green' },
  { type: 'Banners', style: 'Yellow' },
  { type: 'Banners', style: 'PaladinBanner' }
];

function downloadImage(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('Downloading tile assets...');
  for (let i = 0; i < TILES.length; i++) {
    const tile = TILES[i];
    const url = `${BASE_URL}/MapTile/${tile.type}/${tile.style}.png`;
    const dest = path.join(__dirname, '..', 'assets', 'tiles', tile.type, `${tile.style}.png`);
    try {
      await downloadImage(url, dest);
      console.log(`✓ ${tile.type}/${tile.style}`);
    } catch (e) {
      console.error(`✗ ${tile.type}/${tile.style}:`, e);
    }
  }
  
  console.log('\nDownloading object assets...');
  for (let i = 0; i < OBJECTS.length; i++) {
    const obj = OBJECTS[i];
    const url = `${BASE_URL}/MapObject/${obj.type}/${obj.style}.png`;
    const dest = path.join(__dirname, '..', 'assets', 'objects', obj.type, `${obj.style}.png`);
    try {
      await downloadImage(url, dest);
      console.log(`✓ ${obj.type}/${obj.style}`);
    } catch (e) {
      console.error(`✗ ${obj.type}/${obj.style}:`, e);
    }
  }
  console.log('\nDone!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
