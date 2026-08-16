// נוסחת Mifflin-St Jeor — מקור יחיד, נטען גם בדפדפן (script רגיל) וגם בשרת (require)
function calcBMR(weight, height, age, gender) {
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    return gender === 'male' ? bmr + 5 : bmr - 161;
}

function calcTDEE(bmr, activityLevel) {
    return Math.round(bmr * activityLevel);
}

// יעדי קלוריות ומאקרו — מקור יחיד. מחליף חישוב שהיה משוכפל בכמה קבצים (קליינט ושרת),
// שסטייה בין העותקים שלו עלולה ליצור יעדים שונים למשתמש באותו רגע ממקומות שונים באפליקציה.
function calcNutritionTargets({ weight, height, age, gender, activityLevel, goal, proteinRatio, carbRatio }) {
    const bmr = calcBMR(weight, height, age, gender);
    const tdee = calcTDEE(bmr, activityLevel);
    const totalCalories = goal === 'cut' ? tdee - 250 : goal === 'maintain' ? tdee : tdee + 250;
    const proteinGrams = weight * (proteinRatio != null ? proteinRatio : 2);
    const remainingCals = totalCalories - proteinGrams * 4;
    const cr = carbRatio != null ? carbRatio : (goal === 'cut' ? 0.7 : goal === 'maintain' ? 0.65 : 0.6);
    const carbCals = remainingCals * cr;
    const fatCals = remainingCals * (1 - cr);
    return {
        bmr, tdee, totalCalories,
        proteinGrams: Math.round(proteinGrams),
        carbsGrams:   Math.round(carbCals / 4),
        fatGrams:     Math.round(fatCals / 9),
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calcBMR, calcTDEE, calcNutritionTargets };
}
