async function populatePredictorChart(date, homeTeam, awayTeam, predictorChart, $loadingOverlay) {
    $loadingOverlay.find('.spinner-border').show();
    $loadingOverlay.find('.unavailable').hide();
    $loadingOverlay.show();

    date = new Date(date);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + ((3 - date.getDay() + 7) % 7)); // Set to next Wednesday
    let seedDate = getSeedDate(date);

    date.setDate(date.getDate() - 7); // Don't include games from current week so predicted game is in isolation

    let data = {th: homeTeam.teamId, ta: awayTeam.teamId};

    data.games = mrdaRankings.mrdaGames
    .filter(game => seedDate <= game.date && game.date < date
        && !game.forfeit && game.homeTeamId in game.scores && game.awayTeamId in game.scores)
        .map(game => ({th: game.homeTeamId, ta: game.awayTeamId, sh: game.scores[game.homeTeamId], sa:game.scores[game.awayTeamId]}));

    data.seeding = Object.fromEntries(
        Object.entries(mrdaRankings.getRankingHistory(seedDate))
            .map(([teamId, teamRanking]) => [teamId, teamRanking.rankingPoints / mrda_config.virtual_team_rp])
    );
    
    try {
        let response = await fetch('https://grimesbot.pythonanywhere.com/predict-game-lrr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        
        let results = await response.json();

        predictorChart.data.datasets = [];

        predictorChart.data.datasets.push({
            label: homeTeam.name,
            data: results.map(result => ({ x: result['r'], y: result['dh'] * 100})),
        });
        predictorChart.data.datasets.push({
            label: awayTeam.name,
            data: results.map(result => ({ x: result['r'], y: result['da'] * 100})),
        });
        $loadingOverlay.hide();
        predictorChart.update();
    } catch (err) {
        $loadingOverlay.find('.spinner-border').hide();
        $loadingOverlay.find('.unavailable').show();        
        console.error('Request failed:', err);
  }
}

function predictGame(predictorChart, $loadingOverlay) {
    predictorChart.data.datasets = [];
    predictorChart.update();

    let date = $('#predictor-date')[0].valueAsDate;

    let homeTeam = mrdaRankings.mrdaTeams[$('#predictor-home').val()];
    let awayTeam = mrdaRankings.mrdaTeams[$('#predictor-away').val()];

    let homeRp = null;
    let awayRp = null;

    if (homeTeam) {
        $('#predictor-home-logo').attr('src',homeTeam.logo);
        homeRp = homeTeam.getPredictorRankingPoints(date);
        if (homeRp)
            $('#predictor-home-rp').text(homeTeam.getPredictorPointsWithError(date));
        else
            $('#predictor-home-rp').html('&nbsp;');
    }

    if (awayTeam) {
        $('#predictor-away-logo').attr('src',awayTeam.logo);
        awayRp = awayTeam.getPredictorRankingPoints(date);
        if (awayRp)
            $('#predictor-away-rp').text(awayTeam.getPredictorPointsWithError(date));
        else
            $('#predictor-away-rp').html('&nbsp;');
    }

    if (homeRp && awayRp && homeTeam != awayTeam) {
        if (homeRp > awayRp)
            $('#predictor-ratio').text(`${(homeRp/awayRp).toFixed(2)} : 1`);
        else
            $('#predictor-ratio').text(`1 : ${(awayRp/homeRp).toFixed(2)}`);
        populatePredictorChart(date, homeTeam, awayTeam, predictorChart, $loadingOverlay);
    } else
        $('#predictor-ratio').html('&nbsp;');
}

// Setup predictor modal
$(function() {
    let $loadingOverlay = $('#predictor-chart-container .loading-overlay');
    $loadingOverlay.hide();
    $loadingOverlay.find('.unavailable').hide();

    let $date = $('#predictor-date');
    let $teamSelects = $('#predictor-home,#predictor-away');

    $date[0].valueAsDate = new Date();

    Object.values(mrdaRankings.mrdaTeams).sort((a, b) => a.name.localeCompare(b.name)).forEach(team => {
        $teamSelects.append($('<option />').val(team.teamId).text(team.name));
    });

    let predictorChart = new Chart(document.getElementById('predictor-chart'), {
        type: 'line',
        data: {
            datasets: []
        },
        options: {
            scales: {
                x: {
                    type: 'linear',
                    min: 0.25,
                    max: 15,
                    title: {
                        display: true,
                        text: 'Potential Score Ratios (Home : Away)',
                    },
                    ticks: {
                        callback: function(value, index, ticks) {
                            return `${value}:1`;
                        }
                    }
                },
                y: {
                    suggestedMin: -1,
                    suggestedMax: 1,
                    title: {
                        display: true,
                        text: 'Estimated Change in Ranking Points',
                    },
                    ticks: {
                        callback: function(value, index, ticks) {
                            return value > 0 ? `+${value}%` : `${value}%`;
                        }
                    },
                }
            },
            interaction: {
                intersect: false,
                mode: 'nearest',
                axis: 'x'
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            return `Potential Score Ratio: ${context[0].label}:1`;
                        },
                        label: function(context) {
                            return `${context.dataset.label}: ` + `${context.raw.y > 0 ? '+' : ''}${context.raw.y.toFixed(2)}%`;
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Estimated Change in Ranking Points vs. Potential Score Ratios*',
                },
                colors: {
                    forceOverride: true
                }
            },
            responsive: true,
            maintainAspectRatio: false
        },
    });

    $teamSelects.change(function() { predictGame(predictorChart, $loadingOverlay); });
    $date.change(function() { predictGame(predictorChart, $loadingOverlay); });
});