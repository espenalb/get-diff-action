import { Context } from '@actions/github/lib/context';
import { Octokit } from '@octokit/rest';
import { Utils, ApiHelper } from '@technote-space/github-action-helper';
import { PullRequestParams, DiffInfo } from '../types';

export const escape = (items: string[]): string[] => items.map(item => {
	// eslint-disable-next-line no-useless-escape
	if (!/^[A-Za-z0-9_\/-]+$/.test(item)) {
		item = '\'' + item.replace(/'/g, '\'\\\'\'') + '\'';
		item = item.replace(/^(?:'')+/g, '') // unduplicate single-quote at the beginning
			.replace(/\\'''/g, '\\\''); // remove non-escaped single-quote if there are enclosed between 2 escaped
	}
	return item;
});

export const getDiffInfoForPR = (pull: PullRequestParams, context: Context): DiffInfo => ({
	base: Utils.normalizeRef(pull.base.ref),
	head: Utils.normalizeRef(context.ref),
});

export const isDefaultBranch = async(octokit: Octokit, context: Context): Promise<boolean> => await (new ApiHelper(octokit, context)).getDefaultBranch() === Utils.getBranch(context);

export const getDiffInfoForPush = async(octokit: Octokit, context: Context): Promise<DiffInfo> => {
	if (!await isDefaultBranch(octokit, context)) {
		const pull = await (new ApiHelper(octokit, context)).findPullRequest(context.ref);
		if (pull) {
			return {
				base: Utils.normalizeRef(pull.base.ref),
				head: `refs/pull/${pull.number}/merge`,
			};
		}
	} else {
		// merge
		if (/^0+$/.test(context.payload.before)) {
			// default branch => branch
			const pulls = (await octokit.paginate(
				octokit.repos.listPullRequestsAssociatedWithCommit.endpoint.merge({
					owner: context.repo.owner,
					repo: context.repo.repo,
					'commit_sha': context.sha,
				}),
			));
			return {
				base: Utils.normalizeRef(pulls[0].base.ref),
				head: `refs/pull/${pulls[0].number}/merge`,
			};
		} else {
			const pulls = (await octokit.paginate(
				octokit.repos.listPullRequestsAssociatedWithCommit.endpoint.merge({
					owner: context.repo.owner,
					repo: context.repo.repo,
					'commit_sha': context.payload.before,
				}),
			)).filter(pull => context.payload.before === pull.merge_commit_sha);
			if (pulls.length) {
				return {
					base: `refs/pull/${pulls[0].number}/merge`,
					head: context.payload.after,
				};
			}
		}
	}

	return {
		base: context.payload.before,
		head: context.payload.after,
	};
};

export const getDiffInfo = async(octokit: Octokit, context: Context): Promise<DiffInfo> => context.payload.pull_request ? getDiffInfoForPR({base: context.payload.pull_request.base}, context) : await getDiffInfoForPush(octokit, context);
