function generateBingoCard(cardClass) {
    const cardElement = document.querySelector(`.${cardClass}`);
    cardElement.innerHTML = createBingoCard();

    // セルクリックイベントの追加
    cardElement.querySelectorAll('td').forEach(cell => {
        cell.addEventListener('click', (event) => {
            handleCellClick(event.target.closest('td')); // 最近傍のTD要素を取得
        });
    });
}

function createBingoCard() {
    let cardHTML = '<table>';
    const usedNumbers = new Set(); // 使用済みの数字を追跡するためのセット

    for (let row = 0; row < 5; row++) {
        cardHTML += '<tr>';
        for (let col = 0; col < 5; col++) {
            let number;
            do {
                number = Math.floor(Math.random() * 86) + 1; // 1から86の範囲の数字を生成
            } while (usedNumbers.has(number)); // 数字が重複しないようにチェック

            usedNumbers.add(number); // 使用済みの数字として追加
            cardHTML += `<td><img src="images/${number}.png" alt="${number}"></td>`; // 画像をimagesフォルダから表示
        }
        cardHTML += '</tr>';
    }
    cardHTML += '</table>';
    return cardHTML;
}

function handleCellClick(cell) {
    cell.classList.toggle('marked');
}

function shuffleTeams() {
    const names = [
        document.getElementById('name1').value,
        document.getElementById('name2').value,
        document.getElementById('name3').value,
        document.getElementById('name4').value
    ];

    // 空の名前がないかチェック
    for (let name of names) {
        if (!name) {
            alert("全ての名前を入力してください。");
            return;
        }
    }

    // シャッフル
    for (let i = names.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [names[i], names[j]] = [names[j], names[i]];
    }

    // チームに分ける
    document.getElementById('team1-member1').innerText = `${names[0]}`;
    document.getElementById('team1-member2').innerText = `${names[1]}`;
    document.getElementById('team2-member1').innerText = `${names[2]}`;
    document.getElementById('team2-member2').innerText = `${names[3]}`;
}

document.addEventListener('DOMContentLoaded', (event) => {
    generateBingoCards();
});
