const VIRTUAL_TEAM_ID = '0000a';

class MrdaGame {
    constructor(game, mrdaTeams, mrdaEvents, virtualGame = false) {
        this.date = game.date instanceof Date ? game.date : new Date(game.date);
        this.homeTeamId = game.home_team;
        this.scores = {};
        if('home_score' in game)
            this.scores[this.homeTeamId] = game.home_score;
        
        if (virtualGame) {
            this.awayTeamId = VIRTUAL_TEAM_ID;
            this.scores[VIRTUAL_TEAM_ID] =  mrda_config.virtual_team_rp;
            this.eventId = null;
            this.event = new MrdaEvent(null, {start_dt: this.date, name: 'Virtual Games'});
            this.weight = .25;
            this.awayTeam = new MrdaTeam(VIRTUAL_TEAM_ID, { name: 'Virtual Team'});
            this.awayTeam.rankingPoints = mrda_config.virtual_team_rp;
        } else {
            this.awayTeamId = game.away_team;
            if('away_score' in game)
                this.scores[this.awayTeamId] = game.away_score;
            this.eventId = game.event_id;
            this.event = mrdaEvents[this.eventId];
            this.weight = game.weight;
            this.awayTeam = mrdaTeams[this.awayTeamId];            
        }
        
        this.forfeit = game.forfeit;
        this.forfeitTeamId = game.forfeit_team;
        this.status = game.status;
        this.actualRatios = {};
        this.predictorRankingPoints = {};
        this.predictedRatios = {};
        this.performanceDeltas = {};

        this.homeTeam = mrdaTeams[this.homeTeamId];

        // Add scored games (not upcoming games) to teams' Game History
        if (this.homeTeamId in this.scores && this.awayTeamId in this.scores && !virtualGame) {
            this.homeTeam.gameHistory.push(this);
            this.awayTeam.gameHistory.push(this);
        }
    }

    getOpponentTeamId(teamId) {
        return teamId == this.homeTeamId ? this.awayTeamId : this.homeTeamId;
    }    

    getOpponentTeam(teamId) {
        return teamId == this.homeTeamId ? this.awayTeam : this.homeTeam;
    }

    getWL(teamId) {
        return this.scores[teamId] > this.scores[this.getOpponentTeamId(teamId)] ? 'W' : 'L';
    }

    getAtVs(teamId) {
        return this.homeTeamId == teamId ? 'vs' : '@'
    }

    getActualRatio(team) {
        if (team.teamId in this.actualRatios)
            return this.actualRatios[team.teamId];

        if (!(this.homeTeamId in this.scores) || !(this.awayTeamId in this.scores) || this.forfeit)
            this.actualRatios[team.teamId] = null;
        else
            this.actualRatios[team.teamId] = this.scores[team.teamId]/this.scores[this.getOpponentTeamId(team.teamId)];
        return this.actualRatios[team.teamId];
    }

    getActualRatioDisplay(team) {
        let actualRatio = this.getActualRatio(team);
        if (actualRatio == null)
            return null;
        return actualRatio.toFixed(2);
    }

    getActualRatioDisplayWithTooltip(team) {
        let actualRatio = this.getActualRatio(team);
        if (actualRatio == null)
            return null;
        let result = actualRatio.toFixed(2);
        if (actualRatio > mrda_config.ratio_cap || actualRatio < 1/mrda_config.ratio_cap) {
            let weight = (this.weight * 100).toFixed(0);
            let tooltip = `Games with score ratios beyond ${mrda_config.ratio_cap}:1 have diminishing weights in the linear regression algorithm`;
            return `<span data-toggle="tooltip" data-bs-html="true" title="Weight: ${weight}%<br>${tooltip}">${result}*</span>`;
        }
        return result;
    }

    getPredictorRankingPoints(team) {
        if (team.teamId in this.predictorRankingPoints)
            return this.predictorRankingPoints[team.teamId];

        this.predictorRankingPoints[team.teamId] = team.getPredictorRankingPoints(this.date);
        return this.predictorRankingPoints[team.teamId];
    }

    getPredictedRatio(team) {
        if (team.teamId in this.predictedRatios)
            return this.predictedRatios[team.teamId];

        let opponent = this.getOpponentTeam(team.teamId);
        let teamRp = this.getPredictorRankingPoints(team);
        let opponentRp = this.getPredictorRankingPoints(opponent);
        if (teamRp == null || opponentRp == null)
            this.predictedRatios[team.teamId] = null;
        else 
            this.predictedRatios[team.teamId] = teamRp/opponentRp;

        return this.predictedRatios[team.teamId];
    }

    getPredictedRatioDisplay(team) {
        if (team !== undefined) {
            let predictedRatio = this.getPredictedRatio(team);
            if (predictedRatio == null)
                return null;
            return predictedRatio.toFixed(2);
        }

        let predictedRatio = this.getPredictedRatio(this.homeTeam);

        if (predictedRatio == null)
            return null;

        if (predictedRatio > 1)
            return `${predictedRatio.toFixed(2)} : 1`;

        predictedRatio = this.getPredictedRatio(this.awayTeam);
        return `1 : ${predictedRatio.toFixed(2)}`;
    }

    getPredictedRatioWithTooltip(team) {
        let result = this.getPredictedRatioDisplay(team);
        if (result == null)
            return null;

        let ranking = team.getRanking(this.date);
        let opponent = this.getOpponentTeam(team.teamId);
        let teamRp = this.getPredictorRankingPoints(team);
        let opponentRp = this.getPredictorRankingPoints(opponent);

        let tooltip = `Predicted ratio based on Ranking Points as of ${ranking.date.toLocaleDateString(undefined, {year:'2-digit',month:'numeric',day:'numeric'})}:<br>`;
        tooltip += `This Team: ${teamRp.toFixed(2)}<br>`;
        tooltip += `Opponent: ${opponentRp.toFixed(2)}<br>`;

        return `<span data-toggle="tooltip" data-bs-html="true" title="${tooltip}">${result}</span>`;
    }

    getPerformanceDelta(team) {
        if (team.teamId in this.performanceDeltas)
            return this.performanceDeltas[team.teamId];

        let predictedRatio = this.getPredictedRatio(team);
        let actualRatio = this.getActualRatio(team);

        if (predictedRatio == null || actualRatio == null)
            this.performanceDeltas[team.teamId] = null;
        else
            this.performanceDeltas[team.teamId] = actualRatio/predictedRatio;

        return this.performanceDeltas[team.teamId];
    }

    getPerformanceDeltaPct(team)
    {
        let performanceDelta = this.getPerformanceDelta(team);
        if (performanceDelta == null)
            return null;
        let performanceDeltaPct = (performanceDelta - 1) * 100;
        if (performanceDeltaPct > 0)
            return `+${performanceDeltaPct.toFixed(2)}%`;
        return `${performanceDeltaPct.toFixed(2)}%`;
    }

    getPerformanceDeltaDisplay(team, round = 2)
    {
        let performanceDelta = this.getPerformanceDelta(team);
        if (performanceDelta == null)
            return '';
        let performanceDeltaPct = (performanceDelta - 1) * 100;
        let result = performanceDeltaPct.toFixed(round);
        if (performanceDeltaPct > 0) {
            let icon = '<i class="bi bi-triangle-fill text-success"></i>';
            return `${icon} <span class="performance-delta text-success">+${result}%</span>`;
        } else if (performanceDeltaPct < 0) {
            let icon = '<i class="bi bi-triangle-fill down text-danger"></i>';
            return `${icon} <span class="performance-delta text-danger">${result}%</span>`;
        }
        return `<span class="performance-delta">${result}%</span>`;
    }

    getPerformanceDeltaChart(team)
    {
        let performanceDelta = this.getPerformanceDelta(team);
        if (performanceDelta == null)
        {
            let actualRatio = this.getActualRatio(team);
            if (actualRatio == null)
                return null;

            let opponentRp = this.getPredictorRankingPoints(this.getOpponentTeam(team.teamId));
            if (opponentRp == null)
                return null;

            // Calculate for new team as seeding game for visualization
            return opponentRp * actualRatio;
        }
        return this.getPredictorRankingPoints(team) * performanceDelta;
    }

    getPerformanceDeltasDisplay() {
        return `<div class="performance-deltas">${this.getPerformanceDeltaDisplay(this.homeTeam,1)}&nbsp;&nbsp;${this.getPerformanceDeltaDisplay(this.awayTeam,1)}</div>`;
    }
    
    getTeamsScore(teamId) {
        return `${this.scores[teamId]}-${this.scores[this.getOpponentTeamId(teamId)]}`;
    }

    getGameSummary(teamId) {
        return `${this.getTeamsScore(teamId)} ${this.getWL(teamId)} ${this.getAtVs(teamId)} ${this.getOpponentTeam(teamId).name}`;
    }

    getGameDay() {
        if (this.event.startDt != this.event.endDt)
            return this.date.toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    }

    getGameAndEventTitle() {
        if (this.event.name){
            return `${this.date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}: ${this.event.getShortName()}`;
        } else
            return this.date.toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric',weekday:'long'});
    }
}