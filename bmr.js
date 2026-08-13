// נוסחת Mifflin-St Jeor — מקור יחיד, נטען גם בדפדפן (script רגיל) וגם בשרת (require)
function calcBMR(weight, height, age, gender) {
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    return gender === 'male' ? bmr + 5 : bmr - 161;
}

function calcTDEE(bmr, activityLevel) {
    return Math.round(bmr * activityLevel);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calcBMR, calcTDEE };
}
